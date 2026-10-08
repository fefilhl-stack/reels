import { all } from './db';
import {
  bestSlot,
  durationBucket,
  groupStats,
  median,
  postingHeatmap,
  rollupVideos,
  weeklyCadence,
  type FactSet,
} from './analytics';
import { fmtMultiple, fmtNum } from './format';
import { appTz, DAY_MS, startOfWeek, weekdayShort } from './time';
import { HOUR_BUCKETS } from './analytics';
import { PLATFORM_LABEL, type Account, type Platform, type Project } from './types';

// Rule-based "what to do next" list. Each rule looks at one growth lever:
// consistency, the content buffer, winners worth repeating or cross-posting,
// rubrics and formats that pull above the median, timing, and account health.

export type Severity = 'critical' | 'warning' | 'opportunity' | 'info';

export interface Insight {
  id: string;
  severity: Severity;
  projectId: number | null;
  title: string;
  detail: string;
  href?: string;
  action?: string;
}

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };

export function buildInsights(set: FactSet, projects: Project[], now = new Date()): Insight[] {
  const out: Insight[] = [];
  const tz = appTz();
  const projectIds = projects.map((p) => p.id);
  if (!projectIds.length) return out;
  const inList = projectIds.join(',');

  // --- Account health -------------------------------------------------------
  const accounts = all<Account & { project_name: string }>(
    `SELECT a.*, p.name AS project_name FROM accounts a JOIN projects p ON p.id = a.project_id WHERE a.project_id IN (${inList})`,
  );
  for (const a of accounts) {
    if (a.status === 'reauth') {
      out.push({
        id: `reauth-${a.id}`,
        severity: 'critical',
        projectId: a.project_id,
        title: `Переподключите ${PLATFORM_LABEL[a.platform]} @${a.username}`,
        detail: a.status_message || 'Доступ к аккаунту истёк — публикации и статистика остановлены.',
        href: '/accounts',
        action: 'К аккаунтам',
      });
    } else if (a.status === 'error') {
      out.push({
        id: `err-${a.id}`,
        severity: 'warning',
        projectId: a.project_id,
        title: `Ошибка синхронизации @${a.username}`,
        detail: a.status_message,
        href: '/accounts',
        action: 'Проверить',
      });
    }
    if (!a.is_demo && a.platform === 'instagram' && a.token_expires_at) {
      const left = (new Date(a.token_expires_at).getTime() - now.getTime()) / DAY_MS;
      if (left < 7) {
        out.push({
          id: `exp-${a.id}`,
          severity: 'warning',
          projectId: a.project_id,
          title: `Токен Instagram @${a.username} истекает через ${Math.max(0, Math.round(left))} дн.`,
          detail: 'Обновление не сработало автоматически. Переподключите аккаунт, чтобы не потерять расписание.',
          href: '/accounts',
          action: 'Переподключить',
        });
      }
    }
  }

  const failed = all<{ id: number; video_id: number; title: string; project_id: number; platform: Platform; last_error: string }>(
    `SELECT p.id, p.video_id, v.title, v.project_id, p.platform, p.last_error FROM posts p JOIN videos v ON v.id = p.video_id
      WHERE p.status = 'failed' AND v.project_id IN (${inList}) AND p.updated_at > ? ORDER BY p.updated_at DESC LIMIT 5`,
    new Date(now.getTime() - 14 * DAY_MS).toISOString(),
  );
  for (const f of failed) {
    out.push({
      id: `failed-${f.id}`,
      severity: 'critical',
      projectId: f.project_id,
      title: `Не опубликовано: «${f.title}» в ${PLATFORM_LABEL[f.platform]}`,
      detail: f.last_error,
      href: `/content/${f.video_id}`,
      action: 'Разобраться',
    });
  }

  // --- Per project ------------------------------------------------------------
  const weekStart = startOfWeek(now, tz);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  for (const p of projects) {
    const facts = set.facts.filter((f) => f.projectId === p.id);
    const projAccounts = accounts.filter((a) => a.project_id === p.id);
    if (!projAccounts.length) {
      out.push({
        id: `noacc-${p.id}`,
        severity: 'info',
        projectId: p.id,
        title: `«${p.name}»: подключите аккаунты`,
        detail: 'Без аккаунтов ролики проекта не публикуются, а аналитика пустая.',
        href: '/accounts',
        action: 'Подключить',
      });
      continue;
    }

    // Plan for this week: distinct videos published or scheduled Mon–Sun.
    const thisWeek = all<{ n: number }>(
      `SELECT COUNT(DISTINCT p.video_id) AS n FROM posts p JOIN videos v ON v.id = p.video_id
        WHERE v.project_id = ? AND p.status IN ('scheduled','publishing','processing','published')
          AND COALESCE(p.published_at, p.scheduled_at) >= ? AND COALESCE(p.published_at, p.scheduled_at) < ?`,
      p.id,
      weekStart.toISOString(),
      weekEnd.toISOString(),
    )[0].n;
    const gap = p.posts_per_week - thisWeek;
    if (gap > 0) {
      out.push({
        id: `plan-${p.id}`,
        severity: 'warning',
        projectId: p.id,
        title: `«${p.name}»: на этой неделе ${thisWeek} из ${p.posts_per_week} роликов`,
        detail: `Запланируйте ещё ${gap}. Регулярность важнее разовых всплесков: алгоритмы и аудитория привыкают к ритму.`,
        href: '/calendar',
        action: 'В календарь',
      });
    }

    // Content buffer: ready-to-post videos vs. weekly plan.
    const pipeline = all<{ stage: string; n: number }>(
      `SELECT v.stage, COUNT(*) AS n FROM videos v
        WHERE v.project_id = ? AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.video_id = v.id AND p.status != 'canceled')
        GROUP BY v.stage`,
      p.id,
    );
    const count = (s: string) => pipeline.find((x) => x.stage === s)?.n ?? 0;
    const ready = count('ready');
    if (ready < p.posts_per_week) {
      out.push({
        id: `buffer-${p.id}`,
        severity: ready === 0 ? 'warning' : 'info',
        projectId: p.id,
        title: `«${p.name}»: готовых роликов в запасе — ${ready}`,
        detail: `Это меньше недели публикаций (${p.posts_per_week}). В производстве ${count('production')}, в сценариях ${count('script')}. Держите запас на 1–2 недели — так не придётся снимать в последний момент.`,
        href: '/content',
        action: 'К контенту',
      });
    }
    if (count('idea') < 5) {
      out.push({
        id: `ideas-${p.id}`,
        severity: 'info',
        projectId: p.id,
        title: `«${p.name}»: в банке идей ${count('idea')}`,
        detail: 'Пополните банк хотя бы до 10 идей — разбирайте залетевшие ролики и комментарии к ним.',
        href: '/content',
        action: 'Добавить идеи',
      });
    }

    const lastPub = facts.reduce((m, f) => Math.max(m, f.publishedAt), 0);
    if (lastPub && now.getTime() - lastPub > 5 * DAY_MS) {
      out.push({
        id: `silence-${p.id}`,
        severity: 'warning',
        projectId: p.id,
        title: `«${p.name}»: тишина ${Math.floor((now.getTime() - lastPub) / DAY_MS)} дн.`,
        detail: 'Долгие паузы снижают охваты следующих роликов. Опубликуйте что-то из запаса.',
        href: '/content',
        action: 'Выбрать ролик',
      });
    }

    // Winners: recent videos that beat the account median.
    const videos = rollupVideos(facts.filter((f) => now.getTime() - f.publishedAt < 21 * DAY_MS));
    const winners = videos.filter((v) => (v.bestScore ?? 0) >= 2).sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
    for (const w of winners.slice(0, 3)) {
      const posted = new Set(Object.keys(w.byPlatform) as Platform[]);
      const missing = [...new Set(projAccounts.filter((a) => a.status === 'active').map((a) => a.platform))].filter((pl) => !posted.has(pl));
      const top = (Object.values(w.byPlatform) as { platform: Platform; score: number | null }[]).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      out.push({
        id: `win-${w.videoId}`,
        severity: 'opportunity',
        projectId: p.id,
        title: `«${w.title}» залетел: ${fmtMultiple(w.bestScore)} медианы в ${PLATFORM_LABEL[top.platform]}`,
        detail: missing.length
          ? `Ещё не опубликован в ${missing.map((m) => PLATFORM_LABEL[m]).join(', ')} — перенесите, пока тема горячая. Затем снимите продолжение.`
          : 'Снимите продолжение или вариацию с тем же хуком — аудитория уже показала интерес.',
        href: `/content/${w.videoId}`,
        action: missing.length ? 'Опубликовать' : 'Сделать часть 2',
      });
    }

    // Rubrics: which content pillar pulls above / below the project median score.
    const rubrics = groupStats(facts, (f) => (f.rubricId ? String(f.rubricId) : null), (f) => f.rubric ?? '').filter(
      (r) => r.videos >= 3 && r.medianScore != null,
    );
    if (rubrics.length >= 2) {
      const sorted = rubrics.sort((a, b) => (b.medianScore ?? 0) - (a.medianScore ?? 0));
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if ((best.medianScore ?? 0) >= 1.25) {
        out.push({
          id: `rubric-${p.id}-${best.key}`,
          severity: 'opportunity',
          projectId: p.id,
          title: `«${p.name}»: рубрика «${best.label}» тянет — ${fmtMultiple(best.medianScore)} к медиане`,
          detail: `${best.videos} роликов, медиана ${fmtNum(best.medianViews)} просмотров на публикацию. Сделайте её чаще в контент-плане.`,
          href: '/analytics',
          action: 'Подробнее',
        });
      }
      if (worst !== best && (worst.medianScore ?? 1) <= 0.7) {
        out.push({
          id: `rubric-low-${p.id}-${worst.key}`,
          severity: 'info',
          projectId: p.id,
          title: `«${p.name}»: рубрика «${worst.label}» проседает (${fmtMultiple(worst.medianScore)})`,
          detail: 'Попробуйте другой хук и подачу или замените её рубрикой-лидером.',
          href: '/analytics',
          action: 'Подробнее',
        });
      }
    }

    // Timing.
    const slot = bestSlot(postingHeatmap(facts));
    if (slot && (slot.score ?? 0) >= 1.2) {
      out.push({
        id: `time-${p.id}`,
        severity: 'info',
        projectId: p.id,
        title: `«${p.name}»: лучшее время — ${weekdayShort(slot.wd)}, ${HOUR_BUCKETS[slot.bucket]} ч`,
        detail: `Ролики в это окно набирают ${fmtMultiple(slot.score)} от обычного (по ${slot.n} публикациям). Поставьте туда слоты очереди.`,
        href: `/projects/${p.id}`,
        action: 'Настроить слоты',
      });
    }

    // Duration.
    const durations = groupStats(facts.filter((f) => f.duration > 0), (f) => durationBucket(f.duration).key, (f) => durationBucket(f.duration).label).filter(
      (d) => d.videos >= 3 && d.medianScore != null,
    );
    if (durations.length >= 2) {
      const best = durations.sort((a, b) => (b.medianScore ?? 0) - (a.medianScore ?? 0))[0];
      const overall = median(facts.map((f) => f.score).filter((x): x is number => x != null)) ?? 1;
      if ((best.medianScore ?? 0) / overall >= 1.2) {
        out.push({
          id: `dur-${p.id}`,
          severity: 'info',
          projectId: p.id,
          title: `«${p.name}»: лучше всего заходят ролики ${best.label}`,
          detail: `Медиана ${fmtMultiple(best.medianScore)} против ${fmtMultiple(overall)} в среднем по проекту.`,
          href: '/analytics',
          action: 'Подробнее',
        });
      }
    }

    // Platform imbalance.
    const byPlatform = groupStats(facts, (f) => f.platform, (f) => PLATFORM_LABEL[f.platform]).filter((x) => x.posts >= 4);
    if (byPlatform.length >= 2) {
      const s = byPlatform.sort((a, b) => b.medianViews - a.medianViews);
      const ratio = s[0].medianViews / Math.max(1, s[s.length - 1].medianViews);
      if (ratio >= 2.5) {
        out.push({
          id: `plat-${p.id}`,
          severity: 'info',
          projectId: p.id,
          title: `«${p.name}»: ${s[0].label} даёт в ${ratio.toFixed(1).replace('.', ',')} раза больше просмотров, чем ${s[s.length - 1].label}`,
          detail: 'Публикуйте туда всё без исключения и пробуйте там новые форматы первыми.',
          href: '/analytics',
        });
      }
    }

    // Goal pace.
    if (p.followers_goal && p.goal_deadline) {
      const current = projAccounts.reduce((s, a) => s + a.followers, 0);
      const daysLeft = (new Date(p.goal_deadline).getTime() - now.getTime()) / DAY_MS;
      if (current < p.followers_goal && daysLeft > 0) {
        const need = (p.followers_goal - current) / daysLeft;
        const past = all<{ f: number }>(
          `SELECT COALESCE(SUM(s.followers), 0) AS f FROM account_snapshots s JOIN accounts a ON a.id = s.account_id
            WHERE a.project_id = ? AND s.day = (SELECT MIN(day) FROM account_snapshots s2 WHERE s2.account_id = s.account_id AND s2.day >= ?)`,
          p.id,
          new Date(now.getTime() - 14 * DAY_MS).toISOString().slice(0, 10),
        )[0].f;
        const pace = past ? (current - past) / 14 : 0;
        if (pace < need) {
          out.push({
            id: `goal-${p.id}`,
            severity: 'warning',
            projectId: p.id,
            title: `«${p.name}»: темп к цели ${fmtNum(p.followers_goal)} подписчиков отстаёт`,
            detail: `Сейчас +${fmtNum(pace)} в день, нужно +${fmtNum(need)} до ${new Date(p.goal_deadline).toLocaleDateString('ru-RU')}. Добавьте публикаций и повторите форматы-лидеры.`,
            href: `/projects/${p.id}`,
            action: 'К цели',
          });
        }
      }
    }

    const cadence = weeklyCadence(facts, 4, now);
    const hits = cadence.slice(0, 3).filter((c) => c >= p.posts_per_week).length;
    if (facts.length >= 6 && hits === 3) {
      out.push({
        id: `streak-${p.id}`,
        severity: 'info',
        projectId: p.id,
        title: `«${p.name}»: три недели подряд в плане`,
        detail: 'Отличный ритм. Если запас позволяет — попробуйте поднять планку на 1 ролик в неделю.',
      });
    }
  }

  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
