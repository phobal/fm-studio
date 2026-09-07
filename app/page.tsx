/* oxlint-disable react(react-compiler) */
'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Radio,
  RefreshCw,
  SkipBack,
  SkipForward,
  RotateCcw,
  Headphones,
  ArrowUpRight,
} from 'lucide-react';

type Episode = {
  id: string;
  title: string;
  showId: string;
  showTitle: string;
  publishedAt: string;
  duration: number;
  audio: string;
  url: string;
};
type Day = {
  date: string;
  episodes: Episode[];
  shows: {
    id: string;
    appleId: string;
    title: string;
    status: string;
    error?: string;
    episodes: Episode[];
  }[];
};
const KEY = 'morning-radio-progress-v1';
const SHOWS_KEY = 'morning-radio-shows-v1';
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const time = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const DEFAULT_SHOWS = [
  { id: '67891a429407dcd1bfbfcfcb', appleId: '1794422481', title: '资讯早7点' },
  {
    id: '60de7c003dd577b40d5a40f3',
    appleId: '1573189055',
    title: '声动早咖啡',
  },
];

type ConfiguredShow = {
  id: string;
  appleId: string;
  title: string;
  enabled: boolean;
};

async function fetchTodayFromApple(configured: ConfiguredShow[]): Promise<Day> {
  const date = today();
  const shows = await Promise.all(
    configured
      .filter((show) => show.enabled)
      .map(async (show) => {
        try {
          const response = await fetch(
            `https://itunes.apple.com/lookup?id=${show.appleId}&entity=podcastEpisode&limit=10&country=cn`,
            { signal: AbortSignal.timeout(18000) },
          );
          if (!response.ok) throw new Error(`目录返回 ${response.status}`);
          const payload: { results?: Record<string, unknown>[] } =
            await response.json();
          if (!Array.isArray(payload.results))
            throw new Error('目录数据格式异常');
          const resolvedTitle =
            typeof payload.results[0]?.collectionName === 'string'
              ? payload.results[0].collectionName
              : show.title;
          const seen = new Set<string>();
          const episodes: Episode[] = payload.results
            .filter(
              (entry: Record<string, unknown>) =>
                entry.wrapperType === 'podcastEpisode',
            )
            .filter(
              (entry: Record<string, unknown>) =>
                todayFor(entry.releaseDate) === date,
            )
            .map((entry: Record<string, unknown>) => {
              if (
                typeof entry.episodeUrl !== 'string' ||
                !entry.episodeUrl.startsWith('https://') ||
                typeof entry.trackName !== 'string' ||
                typeof entry.trackId !== 'number' ||
                typeof entry.trackTimeMillis !== 'number' ||
                entry.trackTimeMillis <= 0
              )
                throw new Error('单集信息不完整');
              return {
                id: String(entry.trackId),
                title: entry.trackName,
                showId: show.id,
                showTitle: resolvedTitle,
                publishedAt: String(entry.releaseDate),
                duration: Math.round(entry.trackTimeMillis / 1000),
                audio: entry.episodeUrl,
                url:
                  typeof entry.trackViewUrl === 'string'
                    ? entry.trackViewUrl
                    : `https://podcasts.apple.com/cn/podcast/id${show.appleId}`,
              };
            })
            .filter((episode: Episode) => {
              if (seen.has(episode.id)) return false;
              seen.add(episode.id);
              return true;
            })
            .sort(
              (a: Episode, b: Episode) =>
                Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
            );
          return {
            ...show,
            title: resolvedTitle,
            status: episodes.length ? 'ready' : 'empty',
            episodes,
          };
        } catch {
          return {
            ...show,
            status: 'error',
            episodes: [],
            error: '暂时无法获取，稍后刷新重试',
          };
        }
      }),
  );
  return { date, shows, episodes: shows.flatMap((show) => show.episodes) };
}

function todayFor(value: unknown) {
  const date = new Date(typeof value === 'string' ? value : '');
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
}

export default function Home() {
  const audio = useRef<HTMLAudioElement>(null);
  const dataRef = useRef<Day | null>(null);
  const indexRef = useRef(0);
  const completed = useRef<string[]>([]);
  const pendingSeek = useRef<number | null>(null);
  const busy = useRef(false);
  const [data, setData] = useState<Day | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [configuredShows, setConfiguredShows] = useState<ConfiguredShow[]>([]);
  const [showInput, setShowInput] = useState('');
  const [showMessage, setShowMessage] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function saveShows(next: ConfiguredShow[]) {
    setConfiguredShows(next);
    localStorage.setItem(SHOWS_KEY, JSON.stringify(next));
  }

  function addShow() {
    const match =
      showInput.match(/(?:id=|\/id)(\d{6,})/) || showInput.match(/^(\d{6,})$/);
    if (!match) {
      setShowMessage('请输入 Apple Podcast 链接，或粘贴节目 ID。');
      return;
    }
    const appleId = match[1];
    if (configuredShows.some((show) => show.appleId === appleId)) {
      setShowMessage('这个节目已经在列表里。');
      return;
    }
    const next = [
      ...configuredShows,
      {
        id: `custom-${appleId}`,
        appleId,
        title: `节目 ${appleId}`,
        enabled: true,
      },
    ];
    saveShows(next);
    setShowInput('');
    setShowMessage('已添加，刷新后会自动获取节目名称。');
    void refresh();
  }

  function finishDrag(target: number) {
    if (dragIndex === null || target === dragIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...configuredShows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    saveShows(next);
    setDragIndex(null);
    void refresh();
  }

  function save() {
    const d = dataRef.current,
      a = audio.current;
    if (!d || !a) return;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          date: d.date,
          id: d.episodes[indexRef.current]?.id,
          position: pendingSeek.current ?? a.currentTime,
          completed: completed.current,
        }),
      );
    } catch {
      setStorageWarning(true);
    }
  }
  function syncPosition() {
    const a = audio.current;
    if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return;
    try {
      navigator.mediaSession?.setPositionState({
        duration: a.duration,
        playbackRate: a.playbackRate,
        position: Math.min(a.currentTime, a.duration),
      });
    } catch {}
  }
  function select(i: number, autoplay: boolean, seek = 0) {
    const d = dataRef.current,
      a = audio.current,
      e = d?.episodes[i];
    if (!e || !a) return;
    if (d.date !== today()) {
      checkDay();
      return;
    }
    indexRef.current = i;
    setIndex(i);
    setPosition(seek);
    setDuration(e.duration);
    setDone(false);
    pendingSeek.current = seek;
    a.src = e.audio;
    a.load();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: e.title,
        artist: e.showTitle,
        album: '早间电台 · 今日新闻',
      });
    }
    if (autoplay)
      void a
        .play()
        .catch(() =>
          setError('播放已暂停，请点播放继续。若无法播放，请检查网络后重试。'),
        );
  }
  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      let configured = configuredShows;
      if (!configured.length) {
        try {
          configured =
            JSON.parse(localStorage.getItem(SHOWS_KEY) || 'null') ||
            DEFAULT_SHOWS.map((show) => ({ ...show, enabled: true }));
        } catch {
          configured = DEFAULT_SHOWS.map((show) => ({
            ...show,
            enabled: true,
          }));
        }
        setConfiguredShows(configured);
      }
      const d = await fetchTodayFromApple(configured);
      if (d.date !== today() || !Array.isArray(d.episodes)) throw Error();
      const titled = configured.map((item) => {
        const fresh = d.shows.find((show) => show.appleId === item.appleId);
        return fresh?.title && fresh.title !== item.title
          ? { ...item, title: fresh.title }
          : item;
      });
      setConfiguredShows(titled);
      try {
        localStorage.setItem(SHOWS_KEY, JSON.stringify(titled));
      } catch {
        setStorageWarning(true);
      }
      audio.current?.pause();
      dataRef.current = d;
      setData(d);
      completed.current = [];
      let saved: {
        date?: string;
        id?: string;
        position?: number;
        completed?: string[];
      } | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      } catch {
        setStorageWarning(true);
      }
      if (saved?.date === d.date) {
        completed.current = Array.isArray(saved.completed)
          ? saved.completed.filter((id) => d.episodes.some((e) => e.id === id))
          : [];
      } else {
        try {
          localStorage.removeItem(KEY);
        } catch {
          setStorageWarning(true);
        }
      }
      const restored =
        saved?.date === d.date
          ? d.episodes.findIndex((e) => e.id === saved?.id)
          : -1;
      const firstUnplayed = d.episodes.findIndex(
        (e) => !completed.current.includes(e.id),
      );
      const i =
        restored >= 0 && !completed.current.includes(d.episodes[restored].id)
          ? restored
          : Math.max(0, firstUnplayed);
      const pos =
        restored === i &&
        saved?.date === d.date &&
        typeof saved.position === 'number' &&
        Number.isFinite(saved.position)
          ? Math.max(
              0,
              Math.min(
                saved.position,
                Math.max(0, (d.episodes[i]?.duration || 0) - 1),
              ),
            )
          : 0;
      if (d.episodes.length) {
        select(i, false, pos);
        setDone(firstUnplayed < 0);
      } else {
        audio.current?.removeAttribute('src');
        audio.current?.load();
        setPosition(0);
        setDuration(0);
        setDone(false);
      }
    } catch {
      setError('今日播单获取失败，请检查网络后重试。');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  function checkDay() {
    if (dataRef.current && dataRef.current.date !== today()) {
      audio.current?.pause();
      audio.current?.removeAttribute('src');
      audio.current?.load();
      dataRef.current = null;
      setData(null);
      setPlaying(false);
      setDone(false);
      completed.current = [];
      void refresh();
      return true;
    }
    return false;
  }
  function toggle() {
    if (checkDay()) return;
    const a = audio.current,
      d = dataRef.current;
    if (!a || !d?.episodes.length) return;
    setError('');
    if (!a.paused) {
      a.pause();
      save();
      return;
    }
    if (done) {
      completed.current = [];
      select(0, true);
      save();
      return;
    }
    if (a.error) {
      select(indexRef.current, true, position);
      return;
    }
    void a
      .play()
      .catch(() => setError('未能开始播放，请检查网络后再次点击播放。'));
  }
  function next() {
    if (checkDay()) return;
    const d = dataRef.current;
    if (!d) return;
    if (indexRef.current + 1 < d.episodes.length) {
      select(indexRef.current + 1, true);
      save();
    }
  }
  function ended() {
    if (checkDay()) return;
    const d = dataRef.current;
    if (!d) return;
    const id = d.episodes[indexRef.current]?.id;
    if (id && !completed.current.includes(id)) completed.current.push(id);
    if (indexRef.current + 1 < d.episodes.length) {
      select(indexRef.current + 1, true);
      save();
    } else {
      setDone(true);
      setPlaying(false);
      save();
    }
  }
  function jump(delta: number) {
    const a = audio.current;
    if (!a || !Number.isFinite(a.duration)) return;
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + delta));
    pendingSeek.current = null;
    setPosition(a.currentTime);
    syncPosition();
    save();
  }
  const actions = useRef({ toggle, next, select, jump, refresh, checkDay });
  actions.current = { toggle, next, select, jump, refresh, checkDay };
  useEffect(() => {
    void actions.current.refresh();
    const lifecycle = new AbortController();
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (context?.registerTool)
      try {
        void Promise.resolve(
          context.registerTool(
            {
              name: 'get_today_playlist',
              title: '查看今日播单',
              description:
                'Read the current playlist, playback position and source availability without starting audio.',
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
              annotations: { readOnlyHint: true, untrustedContentHint: true },
              execute(input: unknown) {
                if (
                  !input ||
                  typeof input !== 'object' ||
                  Array.isArray(input) ||
                  Object.keys(input).length
                )
                  throw new Error('Expected an empty object');
                return {
                  playlist: dataRef.current,
                  episodeIndex: indexRef.current,
                  position: audio.current?.currentTime || 0,
                  playing: audio.current ? !audio.current.paused : false,
                };
              },
            },
            { signal: lifecycle.signal },
          ),
        ).catch(() => {});
      } catch {}
    const focus = () => actions.current.checkDay();
    const visibility = () => {
      if (document.visibilityState === 'visible') focus();
    };
    const interval = setInterval(focus, 30000);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    const session = navigator.mediaSession;
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => {
        if (audio.current?.paused) actions.current.toggle();
      },
      pause: () => audio.current?.pause(),
      nexttrack: () => actions.current.next(),
      previoustrack: () => {
        if (actions.current.checkDay()) return;
        actions.current.select(Math.max(0, indexRef.current - 1), true);
      },
      seekbackward: (d) => actions.current.jump(-(d.seekOffset || 15)),
      seekforward: (d) => actions.current.jump(d.seekOffset || 15),
      seekto: (d) => {
        if (d.seekTime !== undefined && audio.current)
          actions.current.jump(d.seekTime - audio.current.currentTime);
      },
      stop: () => audio.current?.pause(),
    };
    if (session)
      for (const [key, handler] of Object.entries(handlers))
        try {
          session.setActionHandler(key as MediaSessionAction, handler);
        } catch {}
    return () => {
      lifecycle.abort();
      clearInterval(interval);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
      if (session)
        for (const key of Object.keys(handlers))
          try {
            session.setActionHandler(key as MediaSessionAction, null);
          } catch {}
    };
  }, []);
  const e = data?.episodes[index];
  const total = data?.episodes.reduce((sum, e) => sum + e.duration, 0) || 0;
  const label = loading
    ? '正在准备…'
    : playing
      ? '暂停播放'
      : done
        ? '今日已听完 · 再听一遍'
        : position > 0
          ? '继续收听'
          : '播放今日新闻';
  return (
    <main>
      <header>
        <span className="brand">
          <Radio size={22} />
          早间电台
        </span>
        <span className="edition">MORNING RADIO</span>
      </header>
      <section className="intro">
        <p className="eyebrow">
          {data
            ? `${Number(data.date.slice(5, 7))} 月 ${Number(data.date.slice(8))} 日 · 北京时间`
            : '今日 · 北京时间'}
        </p>
        <h1>
          早上好，
          <br />
          路上慢慢听。
        </h1>
        <p className="muted">
          {loading
            ? '正在查看节目更新…'
            : data?.episodes.length
              ? `${data.episodes.length} 期新闻，${Math.ceil(total / 60)} 分钟。今天的播单准备好了。`
              : '今天还没有可播放的节目。'}
        </p>
      </section>
      <section className="player" aria-label="音频播放器">
        <div className="player-top">
          <span>
            <span className="live-dot" />
            {playing ? '正在播放' : done ? '今日已听完' : '今日播单'}
          </span>
          <span>{e ? `${index + 1} / ${data?.episodes.length}` : '— / —'}</span>
        </div>
        {e ? (
          <>
            <h2 className="now-title">{e.title}</h2>
            <p className="muted" style={{ color: '#b6cbd3', marginBottom: 14 }}>
              {e.showTitle}
            </p>
            <input
              className="seek"
              aria-label="播放进度"
              type="range"
              min="0"
              max={duration || e.duration}
              step="1"
              value={Math.min(position, duration || e.duration)}
              onChange={(event) => {
                const a = audio.current;
                if (a && Number.isFinite(a.duration)) {
                  a.currentTime = Number(event.target.value);
                  pendingSeek.current = null;
                  setPosition(a.currentTime);
                  save();
                  syncPosition();
                }
              }}
            />
            <div className="time">
              <span>{time(position)}</span>
              <span>{time(duration || e.duration)}</span>
            </div>
            <div className="transport">
              <button
                aria-label="上一期"
                disabled={index === 0}
                onClick={() => {
                  select(index - 1, true);
                  save();
                }}
              >
                <SkipBack size={21} />
              </button>
              <button aria-label="后退15秒" onClick={() => jump(-15)}>
                <RotateCcw size={20} />
                <small>15</small>
              </button>
              <button aria-label="前进15秒" onClick={() => jump(15)}>
                <small>15</small>
                <RotateCcw size={20} style={{ transform: 'scaleX(-1)' }} />
              </button>
              <button
                aria-label="下一期"
                disabled={index === (data?.episodes.length || 0) - 1}
                onClick={next}
              >
                <SkipForward size={21} />
              </button>
            </div>
          </>
        ) : (
          <div className={`record ${loading ? 'loading' : ''}`}>
            <Radio size={64} />
          </div>
        )}
        <button className="primary" disabled={loading || !e} onClick={toggle}>
          {playing ? <Pause size={23} /> : <Play size={23} />}{' '}
          {e || loading ? label : '暂无今日更新'}
        </button>
      </section>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {storageWarning && (
        <div className="notice">
          当前浏览器无法保存进度，关闭页面后可能需要重新播放。
        </div>
      )}
      <details className="show-settings">
        <summary>节目频道设置</summary>
        <p className="muted">
          只保存在这台 iPhone。粘贴 Apple Podcast 链接或节目 ID。
        </p>
        <div className="show-add">
          <input
            aria-label="Apple Podcast 链接或节目 ID"
            value={showInput}
            onChange={(event) => setShowInput(event.target.value)}
            placeholder="https://podcasts.apple.com/.../id123456"
          />
          <button className="text-button" onClick={addShow}>
            添加
          </button>
        </div>
        {configuredShows.map((show, i) => (
          <div
            className={`show-config ${dragIndex === i ? 'dragging' : ''}`}
            data-show-index={i}
            key={show.appleId}
            onPointerDown={() => setDragIndex(i)}
            onPointerUp={(event) => {
              const element = document.elementFromPoint(
                event.clientX,
                event.clientY,
              );
              const target = Number(
                (element as HTMLElement | null)
                  ?.closest('[data-show-index]')
                  ?.getAttribute('data-show-index'),
              );
              if (Number.isInteger(target)) finishDrag(target);
              else setDragIndex(null);
            }}
          >
            <span className="drag-handle" aria-hidden="true">
              ☷
            </span>
            <span>{show.title}</span>
            <small>{show.appleId}</small>
            <button
              className="text-button"
              onClick={() =>
                saveShows(
                  configuredShows.map((item) =>
                    item.appleId === show.appleId
                      ? { ...item, enabled: !item.enabled }
                      : item,
                  ),
                )
              }
            >
              {show.enabled ? '启用' : '停用'}
            </button>
          </div>
        ))}
        {showMessage && <p className="empty">{showMessage}</p>}
      </details>
      <div className="section-title">
        <h2>今天听这些</h2>
        <button
          className="text-button"
          disabled={loading || playing}
          onClick={() => {
            save();
            void refresh();
          }}
        >
          <RefreshCw size={15} className={loading ? 'loading' : ''} />
          {loading ? '更新中' : '刷新'}
        </button>
      </div>
      {data?.shows.map((s, i) => (
        <article className="episode" key={s.id}>
          <span className="number">0{i + 1}</span>
          <div className="episode-body">
            <div className="row-top">
              <span className="show">{s.title}</span>
              <span className="badge">
                {s.status === 'error'
                  ? '获取失败'
                  : s.status === 'empty'
                    ? '尚未更新'
                    : s.episodes.every((ep) =>
                          completed.current.includes(ep.id),
                        )
                      ? '已听完'
                      : `${s.episodes.length} 期更新`}
              </span>
            </div>
            {s.episodes.map((ep) => (
              <div key={ep.id}>
                <h3>{ep.title}</h3>
                <p className="muted">
                  {new Intl.DateTimeFormat('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  }).format(new Date(ep.publishedAt))}{' '}
                  更新 · {time(ep.duration)}
                </p>
                <a href={ep.url} target="_blank" rel="noreferrer">
                  在 Apple Podcasts 打开 <ArrowUpRight size={13} />
                </a>
              </div>
            ))}
            {s.status !== 'ready' && (
              <p className="empty">{s.error || '今天更新后，刷新即可加入。'}</p>
            )}
          </div>
        </article>
      ))}
      {!data && !loading && <p className="empty">点击“刷新”重新获取节目。</p>}
      <footer>只听今天 · 固定顺序 · 不积压</footer>
      {/* Public podcast sources provide audio only; no caption track is available. */}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audio}
        preload="metadata"
        playsInline
        onLoadedMetadata={() => {
          const a = audio.current;
          if (!a) return;
          if (Number.isFinite(a.duration)) {
            setDuration(a.duration);
            if (pendingSeek.current !== null) {
              a.currentTime = Math.min(
                pendingSeek.current,
                Math.max(0, a.duration - 0.1),
              );
              pendingSeek.current = null;
            }
          }
          syncPosition();
        }}
        onTimeUpdate={() => {
          const a = audio.current;
          if (!a) return;
          setPosition(a.currentTime);
          syncPosition();
          save();
        }}
        onPlay={() => {
          if (checkDay()) return;
          setPlaying(true);
          setError('');
          if (navigator.mediaSession)
            navigator.mediaSession.playbackState = 'playing';
        }}
        onPause={() => {
          setPlaying(false);
          save();
          if (navigator.mediaSession)
            navigator.mediaSession.playbackState = 'paused';
        }}
        onEnded={ended}
        onError={() => {
          if (dataRef.current?.episodes.length) {
            setPlaying(false);
            setError(
              '音频暂时无法播放，请点播放重试，或在 Apple Podcasts 查看本期。',
            );
          }
        }}
      />
    </main>
  );
}
