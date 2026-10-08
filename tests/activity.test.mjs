// Activity monitoring model. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackingCoverage, observedActions, dailyCounts, TRACKED_EVENTS } from '../assets/js/services/activity.js';

const e = (action, createdAt = '2026-10-07T10:00:00Z') => ({ action, createdAt });

test('coverage separates recorded, not-seen-yet and not-collected events', () => {
  const cov = Object.fromEntries(trackingCoverage([e('content.approved'), e('content.approved', '2026-10-08T09:00:00Z'), e('role.granted')]).map(r => [r.id, r]));
  assert.equal(cov['content.approved'].status, 'recorded');
  assert.equal(cov['content.approved'].count, 2);
  assert.equal(cov['content.approved'].lastAt, '2026-10-08T09:00:00Z');
  assert.equal(cov['role.changed'].status, 'recorded');
  assert.equal(cov['content.rejected'].status, 'not_seen', 'collectable but absent from the sample');
  assert.equal(cov['auth.sign_in'].status, 'not_collected');
  assert.equal(cov['auth.sign_out'].status, 'not_collected');
  assert.equal(cov.presence.status, 'not_collected', 'no presence data → never claims who is online');
  assert.equal(trackingCoverage([]).length, TRACKED_EVENTS.length);
});

test('if the backend starts logging auth events they show up as recorded', () => {
  const cov = Object.fromEntries(trackingCoverage([e('auth.sign_in')]).map(r => [r.id, r]));
  assert.equal(cov['auth.sign_in'].status, 'recorded');
});

test('observed actions are reported exactly as named, most frequent first', () => {
  assert.deepEqual(observedActions([e('b.x'), e('a.y'), e('b.x'), { createdAt: 'x' }]).map(r => [r.action, r.count]), [['b.x', 2], ['a.y', 1]]);
});

test('daily counts cover the last N local days and ignore older/invalid entries', () => {
  const now = new Date(2026, 9, 8, 15, 0);
  const at = (...d) => ({ action: 'a', createdAt: new Date(...d).toISOString() });
  const days = dailyCounts([at(2026, 9, 8, 9), at(2026, 9, 6, 9), at(2026, 8, 1), { action: 'a', createdAt: 'nope' }], { days: 3, now });
  assert.deepEqual(days, [{ day: '2026-10-06', count: 1 }, { day: '2026-10-07', count: 0 }, { day: '2026-10-08', count: 1 }]);
});
