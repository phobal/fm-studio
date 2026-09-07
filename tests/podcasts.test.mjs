import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chinaDate, parseShow, getToday, SHOWS } from '../lib/podcasts.mjs';
const day = '2026-09-07';
const ep = (eid, pubDate) => ({
  eid,
  pubDate,
  title: eid,
  duration: 600,
  enclosure: { url: 'https://media.xyzcdn.net/test.m4a' },
});
const html = (episodes) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { podcast: { episodes } } } })}</script>`;
test('Beijing midnight separates old and new episodes', () => {
  assert.equal(chinaDate('2026-09-06T16:00:00Z'), day);
  assert.equal(chinaDate('2026-09-06T15:59:59Z'), '2026-09-06');
  assert.equal(chinaDate('bad'), '');
  const result = parseShow(
    html([
      ep('yesterday', '2026-09-06T15:59:59Z'),
      ep('today', '2026-09-06T23:00:00Z'),
    ]),
    SHOWS[0],
    day,
  );
  assert.deepEqual(
    result.episodes.map((e) => e.id),
    ['today'],
  );
});
test('deduplicates and sorts same-show episodes', () => {
  const first = ep('first', '2026-09-06T23:00:00Z');
  const result = parseShow(
    html([ep('second', '2026-09-07T01:00:00Z'), first, first]),
    SHOWS[0],
    day,
  );
  assert.deepEqual(
    result.episodes.map((e) => e.id),
    ['first', 'second'],
  );
});
test('no update is distinct from malformed data', () => {
  assert.equal(parseShow(html([]), SHOWS[0], day).status, 'empty');
  assert.throws(() => parseShow('<html/>', SHOWS[0], day));
  assert.throws(() =>
    parseShow(
      html([
        {
          ...ep('a', '2026-09-06T23:00:00Z'),
          enclosure: { url: 'javascript:alert(1)' },
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
        html([
          ep(url.includes(SHOWS[0].id) ? 'A' : 'B', '2026-09-06T23:00:00Z'),
        ]),
      ),
    '2026-09-07T02:00:00Z',
  );
  assert.deepEqual(
    result.episodes.map((e) => e.id),
    ['A', 'B'],
  );
  const partial = await getToday(async (url) => {
    if (url.includes(SHOWS[0].id)) throw Error('offline');
    return new Response(html([]));
  }, '2026-09-07T02:00:00Z');
  assert.deepEqual(
    partial.shows.map((s) => s.status),
    ['error', 'empty'],
  );
});
