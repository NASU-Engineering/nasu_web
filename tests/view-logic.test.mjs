// Small pure helpers exported by views. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= { href: 'http://example.test/', hostname: 'example.test', origin: 'http://example.test', pathname: '/', search: '', hash: '' };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { upcomingDeadlines } = await import('../assets/js/views/dashboard.js');
const { reviewEvents } = await import('../assets/js/views/console/review-history.js');

test('Home shows open assignments, soonest deadline first', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const list = [
    { id: 'late', dueAt: '2026-10-07T12:00:00Z' },
    { id: 'far', dueAt: '2026-10-20T12:00:00Z' },
    { id: 'soon', dueAt: '2026-10-09T12:00:00Z' },
    { id: 'none', dueAt: null },
    { id: 'mid', dueAt: '2026-10-12T12:00:00Z' },
  ];
  assert.deepEqual(upcomingDeadlines(list, { now }).map(a => a.id), ['soon', 'mid', 'far']);
  assert.deepEqual(upcomingDeadlines(list, { now, limit: 1 }).map(a => a.id), ['soon']);
  assert.deepEqual(upcomingDeadlines(null, { now }), []);
});

test('review history: one event per decision and per publication, newest first', () => {
  const items = [
    { id: 'a', status: 'published', reviewedAt: '2026-10-01T10:00:00Z', publishedAt: '2026-10-02T10:00:00Z' },
    { id: 'b', status: 'rejected', reviewedAt: '2026-10-03T10:00:00Z', publishedAt: null },
    { id: 'c', status: 'approved', reviewedAt: '2026-09-30T10:00:00Z', publishedAt: null },
  ];
  assert.deepEqual(reviewEvents(items).map(e => `${e.kind}:${e.item.id}`), ['rejected:b', 'published:a', 'approved:a', 'approved:c']);
  assert.deepEqual(reviewEvents([]), []);
});
