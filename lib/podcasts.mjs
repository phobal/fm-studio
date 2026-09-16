export const SHOWS = [
  { id: '67891a429407dcd1bfbfcfcb', appleId: '1794422481', title: '资讯早7点' },
  {
    id: '60de7c003dd577b40d5a40f3',
    appleId: '1573189055',
    title: '声动早咖啡',
  },
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

export function parseAppleShow(payload, show, day) {
  if (!Array.isArray(payload?.results))
    throw new Error('播客目录数据格式发生变化');
  const seen = new Set();
  const episodes = payload.results
    .filter((entry) => entry.wrapperType === 'podcastEpisode')
    .filter((entry) => chinaDate(entry.releaseDate) === day)
    .map((entry) => {
      if (
        typeof entry.episodeUrl !== 'string' ||
        !entry.episodeUrl.startsWith('https://') ||
        typeof entry.trackName !== 'string' ||
        !Number.isFinite(entry.trackTimeMillis) ||
        entry.trackTimeMillis <= 0 ||
        !entry.trackId
      )
        throw new Error('今日节目暂缺可播放的音频');
      return {
        id: String(entry.trackId),
        title: entry.trackName,
        showId: show.id,
        showTitle: show.title,
        publishedAt: entry.releaseDate,
        duration: Math.round(entry.trackTimeMillis / 1000),
        audio: entry.episodeUrl,
        url:
          entry.trackViewUrl ||
          `https://podcasts.apple.com/cn/podcast/id${show.appleId}`,
      };
    })
    .filter((episode) => {
      if (seen.has(episode.id)) return false;
      seen.add(episode.id);
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
          `https://itunes.apple.com/lookup?id=${show.appleId}&entity=podcastEpisode&limit=200&country=us`,
          { signal: AbortSignal.timeout(12000) },
        );
        if (!response.ok) throw new Error(`播客目录返回 ${response.status}`);
        return parseAppleShow(await response.json(), show, date);
      } catch (error) {
        console.error('[morning-radio-source]', {
          showId: show.id,
          error: error instanceof Error ? error.message : String(error),
        });
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
