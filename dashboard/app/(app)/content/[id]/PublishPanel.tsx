'use client';

import { useEffect, useState, useTransition } from 'react';
import { schedulePublish, tiktokCreatorInfo, type PublishTarget, type When } from '@/app/actions';
import { aiCaptions } from '@/app/ai-actions';
import { hashtagList, LIMITS } from '@/lib/captions';
import { PLATFORM_LABEL, type AccountStatus, type Platform, type PostOptions } from '@/lib/types';
import { IconSpark } from '@/components/Icons';
import { PlatformTag } from '@/components/ui';

interface Acc {
  id: number;
  platform: Platform;
  username: string;
  displayName: string;
  status: AccountStatus;
  isDemo: boolean;
  posted: boolean;
}

interface Draft {
  on: boolean;
  title: string;
  caption: string;
  options: PostOptions;
}

const TT_PRIVACY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Все',
  MUTUAL_FOLLOW_FRIENDS: 'Друзья (взаимные подписки)',
  FOLLOWER_OF_CREATOR: 'Подписчики',
  SELF_ONLY: 'Только я',
};

export function PublishPanel({
  videoId,
  hasFile,
  title,
  duration,
  accounts,
  defaults,
  nextSlot,
  defaultAt,
  ai,
  tz,
}: {
  videoId: number;
  hasFile: boolean;
  title: string;
  duration: number;
  accounts: Acc[];
  defaults: Record<Platform, string>;
  nextSlot: { iso: string; label: string } | null;
  defaultAt: string;
  ai: boolean;
  tz: string;
}) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(
      accounts.map((a) => [
        a.id,
        {
          on: a.status === 'active' && !a.posted,
          title: title.slice(0, 100),
          caption: defaults[a.platform],
          options:
            a.platform === 'tiktok'
              ? { privacy: '', disableComment: false, disableDuet: false, disableStitch: false, brandOrganic: false, brandContent: false, aigc: false }
              : a.platform === 'instagram'
                ? { shareToFeed: true }
                : { privacy: 'public', madeForKids: false, categoryId: '22', aigc: false },
        },
      ]),
    ),
  );
  const [creator, setCreator] = useState<Record<number, { privacyOptions: string[]; maxDurationSec?: number; commentDisabled?: boolean; duetDisabled?: boolean; stitchDisabled?: boolean; error?: string }>>({});
  const [mode, setMode] = useState<When['mode']>(nextSlot ? 'queue' : 'at');
  const [at, setAt] = useState(defaultAt);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [aiPending, startAi] = useTransition();

  // TikTok requires showing the creator's current posting options before every post.
  useEffect(() => {
    for (const a of accounts.filter((x) => x.platform === 'tiktok' && x.status === 'active')) {
      if (a.isDemo) {
        setCreator((c) => ({ ...c, [a.id]: { privacyOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'] } }));
        continue;
      }
      tiktokCreatorInfo(a.id).then((info) => {
        if (!info) return;
        setCreator((c) => ({ ...c, [a.id]: 'error' in info ? { privacyOptions: [], error: String(info.error) } : info }));
      });
    }
  }, [accounts]);

  const patch = (id: number, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const patchOpt = (id: number, o: Partial<PostOptions>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], options: { ...d[id].options, ...o } } }));

  function fillFromAi() {
    startAi(async () => {
      setAiError(null);
      const r = await aiCaptions(videoId);
      if (!r.ok) return setAiError(r.error);
      const tags = r.data.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`));
      setDrafts((d) => {
        const next = { ...d };
        for (const a of accounts) {
          const cur = next[a.id];
          if (a.platform === 'tiktok') next[a.id] = { ...cur, caption: `${r.data.tiktok}\n\n${tags.slice(0, 5).join(' ')}` };
          if (a.platform === 'instagram') next[a.id] = { ...cur, caption: `${r.data.instagram}\n\n${tags.slice(0, 15).join(' ')}` };
          if (a.platform === 'youtube')
            next[a.id] = { ...cur, title: r.data.youtube_title.slice(0, 100), caption: `${r.data.youtube_description}\n\n${[...tags.slice(0, 3), '#shorts'].join(' ')}` };
        }
        return next;
      });
    });
  }

  function submit(forceMode?: When['mode']) {
    const m = forceMode ?? mode;
    const targets: PublishTarget[] = accounts
      .filter((a) => drafts[a.id].on)
      .map((a) => ({ accountId: a.id, title: drafts[a.id].title, caption: drafts[a.id].caption, options: drafts[a.id].options }));
    const when: When = m === 'at' ? { mode: 'at', at } : { mode: m };
    start(async () => setResult(await schedulePublish(videoId, targets, when)));
  }

  if (!accounts.length) {
    return (
      <section className="card card-pad">
        <h2>Публикация</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          У проекта нет подключённых аккаунтов.{' '}
          <a className="link" href="/accounts">
            Подключить
          </a>
        </p>
      </section>
    );
  }

  const selected = accounts.filter((a) => drafts[a.id].on);
  const needsFile = !hasFile && selected.some((a) => !a.isDemo);

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Публикация</h2>
          <p>Подписи под каждую площадку; время — по {tz}</p>
        </div>
        {ai && (
          <button className="btn btn-sm" onClick={fillFromAi} disabled={aiPending}>
            <IconSpark size={14} /> {aiPending ? 'Пишу…' : 'Подписи от ИИ'}
          </button>
        )}
      </div>
      <div className="card-body stack">
        {aiError && <div className="notice notice-error">{aiError}</div>}
        {accounts.map((a) => {
          const d = drafts[a.id];
          const limit = LIMITS[a.platform];
          const tags = hashtagList(d.caption).length;
          const info = creator[a.id];
          const disabled = a.status !== 'active';
          return (
            <div key={a.id} className="target" data-on={d.on}>
              <label className="check spread" style={{ alignItems: 'center' }}>
                <span className="row" style={{ gap: 10 }}>
                  <input type="checkbox" checked={d.on} disabled={disabled} onChange={(e) => patch(a.id, { on: e.target.checked })} />
                  <PlatformTag platform={a.platform} />
                  <span className="muted">@{a.username}</span>
                  {a.isDemo && <span className="badge badge-info">демо</span>}
                  {a.posted && <span className="badge badge-good">уже в публикациях</span>}
                  {disabled && <span className="badge badge-critical">нужно переподключить</span>}
                </span>
              </label>
              {d.on && (
                <>
                  {a.platform === 'youtube' && (
                    <label className="field">
                      <span>Заголовок</span>
                      <input className="input" value={d.title} maxLength={100} onChange={(e) => patch(a.id, { title: e.target.value })} />
                      <span className="counter" data-over={d.title.length > 100}>
                        {d.title.length} / 100
                      </span>
                    </label>
                  )}
                  <label className="field">
                    <span>{a.platform === 'youtube' ? 'Описание' : 'Подпись'}</span>
                    <textarea className="textarea" rows={6} value={d.caption} onChange={(e) => patch(a.id, { caption: e.target.value })} />
                    <span className="counter" data-over={d.caption.length > limit.caption || (!!limit.hashtags && tags > limit.hashtags)}>
                      {limit.hashtags ? `хештегов ${tags} / ${limit.hashtags} · ` : ''}
                      {d.caption.length} / {limit.caption}
                    </span>
                  </label>

                  {a.platform === 'tiktok' && (
                    <div className="stack-sm">
                      <div className="small muted">Публикуется от имени {a.displayName || a.username} (@{a.username})</div>
                      {info?.error && <div className="notice notice-error">TikTok: {info.error}</div>}
                      {info?.maxDurationSec && duration > info.maxDurationSec && (
                        <div className="notice notice-error">Ролик длиннее лимита аккаунта ({info.maxDurationSec} с)</div>
                      )}
                      <label className="field">
                        <span>Кто может смотреть</span>
                        <select className="select" value={d.options.privacy} onChange={(e) => patchOpt(a.id, { privacy: e.target.value })}>
                          <option value="" disabled>
                            Выберите…
                          </option>
                          {(info?.privacyOptions ?? []).map((p) => (
                            <option key={p} value={p} disabled={p === 'SELF_ONLY' && d.options.brandContent}>
                              {TT_PRIVACY[p] ?? p}
                            </option>
                          ))}
                        </select>
                        {!a.isDemo && <span className="hint">Пока приложение не прошло аудит TikTok, доступно только «Только я».</span>}
                      </label>
                      <div className="row" style={{ gap: 14 }}>
                        <label className="check">
                          <input type="checkbox" checked={!d.options.disableComment} disabled={info?.commentDisabled} onChange={(e) => patchOpt(a.id, { disableComment: !e.target.checked })} />
                          Комментарии
                        </label>
                        <label className="check">
                          <input type="checkbox" checked={!d.options.disableDuet} disabled={info?.duetDisabled} onChange={(e) => patchOpt(a.id, { disableDuet: !e.target.checked })} />
                          Дуэты
                        </label>
                        <label className="check">
                          <input type="checkbox" checked={!d.options.disableStitch} disabled={info?.stitchDisabled} onChange={(e) => patchOpt(a.id, { disableStitch: !e.target.checked })} />
                          Склейки
                        </label>
                      </div>
                      <label className="check">
                        <input type="checkbox" checked={!!d.options.brandOrganic} onChange={(e) => patchOpt(a.id, { brandOrganic: e.target.checked })} />
                        Продвигаю свой бренд или продукт
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!!d.options.brandContent}
                          onChange={(e) => patchOpt(a.id, { brandContent: e.target.checked, privacy: e.target.checked && d.options.privacy === 'SELF_ONLY' ? '' : d.options.privacy })}
                        />
                        Реклама по договорённости с брендом (Paid partnership)
                      </label>
                      <label className="check">
                        <input type="checkbox" checked={!!d.options.aigc} onChange={(e) => patchOpt(a.id, { aigc: e.target.checked })} />
                        Создано с помощью ИИ
                      </label>
                      <span className="hint">
                        Публикуя, вы соглашаетесь с Music Usage Confirmation TikTok{d.options.brandContent ? ' и Branded Content Policy' : ''}.
                      </span>
                    </div>
                  )}

                  {a.platform === 'instagram' && (
                    <label className="check">
                      <input type="checkbox" checked={d.options.shareToFeed !== false} onChange={(e) => patchOpt(a.id, { shareToFeed: e.target.checked })} />
                      Показывать в ленте профиля
                    </label>
                  )}

                  {a.platform === 'youtube' && (
                    <div className="row" style={{ gap: 14 }}>
                      <select className="select" style={{ width: 'auto' }} value={d.options.privacy} onChange={(e) => patchOpt(a.id, { privacy: e.target.value })}>
                        <option value="public">Открытый доступ</option>
                        <option value="unlisted">Доступ по ссылке</option>
                        <option value="private">Ограниченный доступ</option>
                      </select>
                      <label className="check">
                        <input type="checkbox" checked={!!d.options.madeForKids} onChange={(e) => patchOpt(a.id, { madeForKids: e.target.checked })} />
                        Для детей
                      </label>
                      <label className="check">
                        <input type="checkbox" checked={!!d.options.aigc} onChange={(e) => patchOpt(a.id, { aigc: e.target.checked })} />
                        Реалистичный ИИ-контент
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        <div className="stack-sm">
          <span className="label">Когда</span>
          <div className="row" style={{ gap: 14 }}>
            {nextSlot && (
              <label className="check">
                <input type="radio" name="when" checked={mode === 'queue'} onChange={() => setMode('queue')} />В очередь: {nextSlot.label}
              </label>
            )}
            <label className="check">
              <input type="radio" name="when" checked={mode === 'at'} onChange={() => setMode('at')} />
              Дата и время
            </label>
            {mode === 'at' && <input type="datetime-local" className="input" style={{ width: 210 }} value={at} onChange={(e) => setAt(e.target.value)} />}
          </div>
        </div>

        {needsFile && <div className="notice notice-error">Прикрепите видеофайл — без него ролик некуда загружать.</div>}
        {result && <div className={`notice ${result.ok ? 'notice-ok' : 'notice-error'}`}>{result.message}</div>}

        <div className="row">
          <button className="btn btn-primary" disabled={pending || !selected.length || needsFile} onClick={() => submit()}>
            {pending ? 'Сохраняем…' : `Запланировать (${selected.length})`}
          </button>
          <button className="btn" disabled={pending || !selected.length || needsFile} onClick={() => submit('now')}>
            Опубликовать сейчас
          </button>
          <span className="hint">{selected.map((a) => PLATFORM_LABEL[a.platform]).join(', ')}</span>
        </div>
      </div>
    </section>
  );
}
