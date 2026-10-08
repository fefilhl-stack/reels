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
import { countWords, parseRange, rangeState, ruDate } from './plan';
import { appTz, DAY_MS, dayKey, parseLocal, weekdayShort } from './time';
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

    // --- Content plan -------------------------------------------------------
    const demoOnly = projAccounts.every((a) => a.is_demo);
    const plan = all<{ id: number; number: number; title: string; plan_date: string | null; plan_time: string | null; status: string; file_name: string | null; script: string; posts: number; published: number }>(
      `SELECT v.id, v.number, v.title, v.plan_date, v.plan_time, v.status, v.file_name, v.script,
              (SELECT COUNT(*) FROM posts p WHERE p.video_id = v.id AND p.status IN ('scheduled','publishing','processing','published')) AS posts,
              (SELECT COUNT(*) FROM posts p WHERE p.video_id = v.id AND p.status = 'published') AS published
         FROM videos v WHERE v.project_id = ? AND v.number > 0 ORDER BY v.number`,
      p.id,
    );
    const at = (r: (typeof plan)[number]) => (r.plan_date ? (parseLocal(`${r.plan_date}T${r.plan_time || '12:00'}`)?.getTime() ?? null) : null);
    const when = (r: (typeof plan)[number]) => `№${r.number} (${ruDate(r.plan_date).slice(0, 5)}${r.plan_time ? ` ${r.plan_time}` : ''})`;
    const nowMs = now.getTime();

    const soon = plan.filter((r) => {
      const t = at(r);
      return t != null && t > nowMs && t - nowMs < 72 * 3_600_000 && !r.posts && !r.file_name && r.status !== 'Опубликован';
    });
    if (soon.length && !demoOnly) {
      const urgent = soon.some((r) => (at(r) ?? 0) - nowMs < 26 * 3_600_000);
      out.push({
        id: `soon-${p.id}`,
        severity: urgent ? 'critical' : 'warning',
        projectId: p.id,
        title: `«${p.name}»: на ближайшие 3 дня не загружено роликов — ${soon.length}`,
        detail: `${soon.map(when).join(', ')}. Загрузите ролики в контент-плане, чтобы они вышли по расписанию.`,
        href: `/content?p=${p.id}`,
        action: 'К плану',
      });
    }

    const waiting = plan.filter((r) => {
      const t = at(r);
      return t != null && t > nowMs && !r.posts && (r.file_name || (demoOnly && r.status === 'Смонтирован')) && r.status !== 'Опубликован';
    });
    if (waiting.length) {
      out.push({
        id: `waiting-${p.id}`,
        severity: 'warning',
        projectId: p.id,
        title: `«${p.name}»: загружено, но не запланировано — ${waiting.length}`,
        detail: `${waiting.slice(0, 5).map(when).join(', ')}${waiting.length > 5 ? '…' : ''}. Кнопка «Запланировать загруженные» поставит их на даты из плана.`,
        href: `/content?p=${p.id}`,
        action: 'Запланировать',
      });
    }

    const missed = plan.filter((r) => {
      const t = at(r);
      return t != null && nowMs - t > 2 * 3_600_000 && nowMs - t < 21 * DAY_MS && !r.published && r.status !== 'Опубликован';
    });
    if (missed.length) {
      out.push({
        id: `missed-${p.id}`,
        severity: 'warning',
        projectId: p.id,
        title: `«${p.name}»: пропущено по плану — ${missed.length}`,
        detail: `${missed.slice(0, 5).map(when).join(', ')}. Опубликуйте или перенесите даты — регулярность важнее разовых всплесков.`,
        href: `/content?p=${p.id}`,
        action: 'К плану',
      });
    }

    const lastDate = plan.reduce<string | null>((m, r) => (r.plan_date && (!m || r.plan_date > m) ? r.plan_date : m), null);
    const ymdMs = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
    const daysLeft = lastDate ? Math.round((ymdMs(lastDate) - ymdMs(dayKey(now, appTz()))) / DAY_MS) : -1;
    if (daysLeft < 7) {
      out.push({
        id: `planend-${p.id}`,
        severity: daysLeft < 3 ? 'warning' : 'info',
        projectId: p.id,
        title: lastDate ? `«${p.name}»: контент-план заканчивается ${ruDate(lastDate)}` : `«${p.name}»: контент-план пуст`,
        detail: 'Допишите сценарии хотя бы на две недели вперёд — темы можно подобрать по залетевшим роликам кнопкой «Темы по лучшим роликам».',
        href: `/content?p=${p.id}`,
        action: 'Добавить сценарии',
      });
    }

    const norm = parseRange(p.words_norm);
    if (norm) {
      const off = plan.filter((r) => r.status !== 'Опубликован' && r.script.trim() && rangeState(countWords(r.script), norm) !== 'ok');
      if (off.length) {
        out.push({
          id: `words-${p.id}`,
          severity: 'info',
          projectId: p.id,
          title: `«${p.name}»: вне нормы слов (${p.words_norm}) — ${off.length}`,
          detail: `${off.slice(0, 6).map((r) => `№${r.number}: ${countWords(r.script)}`).join(', ')}. Длинный текст не влезет в хронометраж, короткий — недодаст пользы.`,
          href: `/content?p=${p.id}`,
          action: 'К плану',
        });
      }
    }

    const notVoiced = plan.filter((r) => {
      const t = at(r);
      return t != null && t > nowMs && t - nowMs < 7 * DAY_MS && r.status === 'Не начат';
    });
    if (notVoiced.length >= 2) {
      out.push({
        id: `voice-${p.id}`,
        severity: 'info',
        projectId: p.id,
        title: `«${p.name}»: не озвучено на неделю вперёд — ${notVoiced.length}`,
        detail: `${notVoiced.slice(0, 6).map(when).join(', ')}. Озвучьте их пачкой — так быстрее, чем по одному в день.`,
        href: `/content?p=${p.id}`,
        action: 'К плану',
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
        detail: `Ролики в это окно набирают ${fmtMultiple(slot.score)} от обычного (по ${slot.n} публикациям). Сравните со временем публикации в паспорте проекта.`,
        href: `/projects/${p.id}`,
        action: 'Время в паспорте',
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
