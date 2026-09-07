export const SHOWS = [
  { id: '67891a429407dcd1bfbfcfcb', title: '资讯早7点' },
  { id: '60de7c003dd577b40d5a40f3', title: '声动早咖啡' },
];
export function chinaDate(value = new Date()) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
}
export function parseShow(html, show, day) {
  const match = html.match(
    /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error('节目页面暂时无法读取');
  const podcast = JSON.parse(match[1])?.props?.pageProps?.podcast;
  if (!Array.isArray(podcast?.episodes))
    throw new Error('节目数据格式发生变化');
  const seen = new Set();
  const episodes = podcast.episodes
    .filter((e) => chinaDate(e.pubDate) === day)
    .map((e) => {
      const audio = e.enclosure?.url || e.media?.source?.url;
      if (
        typeof audio !== 'string' ||
        !audio.startsWith('https://') ||
        typeof e.title !== 'string' ||
        !e.eid ||
        !Number.isFinite(e.duration) ||
        e.duration <= 0
      )
        throw new Error('今日节目暂缺可播放的音频');
      return {
        id: String(e.eid),
        title: e.title,
        showId: show.id,
        showTitle: show.title,
        publishedAt: e.pubDate,
        duration: e.duration,
        audio,
        url: `https://www.xiaoyuzhoufm.com/episode/${encodeURIComponent(e.eid)}`,
      };
    })
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  return { ...show, status: episodes.length ? 'ready' : 'empty', episodes };
}
export async function getToday(fetcher = fetch, now = new Date()) {
  const date = chinaDate(now);
  const shows = await Promise.all(
    SHOWS.map(async (show) => {
      try {
        const response = await fetcher(
          `https://www.xiaoyuzhoufm.com/podcast/${show.id}`,
          {
            signal: AbortSignal.timeout(12000),
            headers: { Accept: 'text/html' },
          },
        );
        if (!response.ok) throw new Error('源站暂时不可用');
        return parseShow(await response.text(), show, date);
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
  return { date, shows, episodes: shows.flatMap((s) => s.episodes) };
}
