// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateKind, sortUpdates, filterUpdates, UPDATE_FILTERS } from '../assets/js/services/updates.js';
import { ctaLabel } from '../assets/js/services/deep-links.js';
import { normalizeAnnouncement } from '../assets/js/services/normalize.js';

const u = (over = {}) => normalizeAnnouncement({ id: 'x', title: 't', ...over });

test('primary filters are All · Academic · Deadlines · Activities', () => {
  assert.deepEqual(UPDATE_FILTERS.map(f => f.label), ['All', 'Academic', 'Deadlines', 'Activities']);
});

test('update kind: explicit type wins, else derived from the deep link, else subject → academic, else general', () => {
  assert.equal(updateKind(u({ type: 'activity', subjectId: 'math1' })), 'activity');
  assert.equal(updateKind(u({ update_type: 'deadline' })), 'deadline');
  assert.equal(updateKind(u({ type: 'nonsense', subjectId: 'math1' })), 'academic', 'unknown types are ignored');
  assert.equal(updateKind(u({ link_type: 'assignment', link_id: 'a1', link_subject_id: 'chem' })), 'deadline');
  assert.equal(updateKind(u({ link_type: 'resource', link_id: 'a1', link_subject_id: 'chem', link_category: 'assignment' })), 'deadline');
  assert.equal(updateKind(u({ link_type: 'activity', link_id: 'w1' })), 'activity');
  assert.equal(updateKind(u({ link_type: 'quiz', link_id: 'q1' })), 'academic');
  assert.equal(updateKind(u({ link_type: 'resource', link_id: 'r1', link_subject_id: 'stat', link_category: 'board' })), 'academic');
  assert.equal(updateKind(u({ subjectId: 'chem' })), 'academic');
  assert.equal(updateKind(u()), 'general');
});

test('feed order: pinned first, then newest first', () => {
  const list = [
    u({ id: 'old', publishedAt: '2026-10-01T10:00:00Z' }),
    u({ id: 'pin', pinned: true, publishedAt: '2026-09-01T10:00:00Z' }),
    u({ id: 'new', publishedAt: '2026-10-07T10:00:00Z' }),
  ];
  assert.deepEqual(sortUpdates(list).map(x => x.id), ['pin', 'new', 'old']);
  assert.deepEqual(list.map(x => x.id), ['old', 'pin', 'new'], 'input not mutated');
});

test('filters combine kind and optional subject', () => {
  const list = [
    u({ id: '1', subjectId: 'chem', link_type: 'assignment', link_id: 'a', link_subject_id: 'chem' }),
    u({ id: '2', subjectId: 'chem' }),
    u({ id: '3', link_type: 'activity', link_id: 'w' }),
    u({ id: '4' }),
  ];
  assert.deepEqual(filterUpdates(list).map(x => x.id), ['1', '2', '3', '4'], 'All includes general updates');
  assert.deepEqual(filterUpdates(list, { kind: 'deadline' }).map(x => x.id), ['1']);
  assert.deepEqual(filterUpdates(list, { kind: 'academic' }).map(x => x.id), ['2']);
  assert.deepEqual(filterUpdates(list, { kind: 'activity' }).map(x => x.id), ['3']);
  assert.deepEqual(filterUpdates(list, { subjectId: 'chem' }).map(x => x.id), ['1', '2']);
  assert.deepEqual(filterUpdates(list, { kind: 'academic', subjectId: 'chem' }).map(x => x.id), ['2']);
});

test('one contextual CTA per deep link; none without a valid link', () => {
  assert.equal(ctaLabel({ type: 'resource', id: 'b1', subjectId: 'draw', category: 'board' }), 'Open board');
  assert.equal(ctaLabel({ type: 'resource', id: 'r1', subjectId: 'draw' }), 'Open resource');
  assert.equal(ctaLabel({ type: 'assignment', id: 'a1', subjectId: 'chem' }), 'View assignment');
  assert.equal(ctaLabel({ type: 'quiz', id: 'q1' }), 'Take quiz');
  assert.equal(ctaLabel({ type: 'activity', id: 'w1' }), 'View activity');
  assert.equal(ctaLabel({ type: 'subject', id: 'math1' }), 'Open subject');
  assert.equal(ctaLabel({ type: 'resource', id: '../x', subjectId: 'draw', category: 'board' }), null);
  assert.equal(ctaLabel(null), null);
});
