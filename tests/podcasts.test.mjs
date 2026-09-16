import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chinaDate,
  parseAppleShow,
  getToday,
  SHOWS,
} from '../lib/podcasts.mjs';

const day = '2026-09-07';
const episode = (trackId, releaseDate) => ({
  wrapperType: 'podcastEpisode',
  trackId,
  trackName: trackId,
  releaseDate,
  trackTimeMillis: 600000,
  episodeUrl: 'https://media.example.com/test.m4a',
});
const feed = (episodes) => ({
  results: [{ wrapperType: 'track' }, ...episodes],
});

test('rolling 24-hour window includes episodes across midnight', () => {
  assert.equal(chinaDate('2026-09-06T16:00:00Z'), day);
  assert.equal(chinaDate('2026-09-06T15:59:59Z'), '2026-09-06');
  assert.equal(chinaDate('bad'), '');
  const result = parseAppleShow(
    feed([
      episode('yesterday', '2026-09-06T15:59:59Z'),
      episode('today', '2026-09-06T23:00:00Z'),
    ]),
    SHOWS[0],
    day,
  );
  assert.deepEqual(
    result.episodes.map((item) => item.id),
    ['yesterday', 'today'],
  );
});

test('deduplicates and sorts same-show episodes', () => {
  const first = episode('first', '2026-09-06T23:00:00Z');
  const result = parseAppleShow(
    feed([episode('second', '2026-09-07T01:00:00Z'), first, first]),
    SHOWS[0],
    day,
  );
  assert.deepEqual(
    result.episodes.map((item) => item.id),
    ['first', 'second'],
  );
});

test('no update is distinct from malformed data', () => {
  assert.equal(parseAppleShow(feed([]), SHOWS[0], day).status, 'empty');
  assert.throws(() => parseAppleShow({}, SHOWS[0], day));
  assert.throws(() =>
    parseAppleShow(
      feed([
        {
          ...episode('a', '2026-09-06T23:00:00Z'),
          episodeUrl: 'javascript:alert(1)',
        },
      ]),
      SHOWS[0],
      day,
    ),
  );
});

test('fixed show order survives source failure and completion order', async () => {
  const result = await getToday(
    async (url) =>
      new Response(
        JSON.stringify(
          feed([
            episode(
              url.includes(SHOWS[0].appleId) ? 'A' : 'B',
              '2026-09-06T23:00:00Z',
            ),
          ]),
        ),
      ),
    '2026-09-07T02:00:00Z',
  );
  assert.deepEqual(
    result.episodes.map((item) => item.id),
    ['A', 'B'],
  );
  const partial = await getToday(async (url) => {
    if (url.includes(SHOWS[0].appleId)) throw Error('offline');
    return new Response(JSON.stringify(feed([])));
  }, '2026-09-07T02:00:00Z');
  assert.deepEqual(
    partial.shows.map((show) => show.status),
    ['error', 'empty'],
  );
});
