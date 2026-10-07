// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hubPath, hubUrl } from '../assets/js/services/deep-links.js';
import { normalizeAnnouncement } from '../assets/js/services/normalize.js';

test('hubPath maps link targets to in-app routes', () => {
  assert.equal(hubPath({ type: 'subject', id: 'math1' }), '/subjects/math1');
  assert.equal(hubPath({ type: 'resource', id: 'r-12', subjectId: 'stat' }), '/subjects/stat?item=r-12');
  assert.equal(hubPath({ type: 'assignment', id: 'a1', subjectId: 'chem' }), '/subjects/chem?item=a1');
  assert.equal(hubPath({ type: 'announcement', id: '42' }), '/announcements?item=42');
  assert.equal(hubPath({ type: 'quiz', id: 'q1' }), '/quizzes');
  assert.equal(hubPath({ type: 'activity' }), '/activities');
});

test('hubPath rejects unknown types, unknown subjects and unsafe ids', () => {
  for (const bad of [null, {}, { type: 'admin', id: 'x' }, { type: 'subject', id: 'nope' },
    { type: 'resource', id: 'r1' }, { type: 'resource', id: 'r1', subjectId: 'zzz' },
    { type: 'resource', id: '../../admin', subjectId: 'math1' }, { type: 'announcement', id: '<script>' },
    { type: 'announcement', id: 'javascript:alert(1)' }, { type: 'announcement', id: '' }]) {
    assert.equal(hubPath(bad), null, JSON.stringify(bad));
  }
});

test('hubUrl builds a shareable absolute link', () => {
  assert.equal(hubUrl({ type: 'subject', id: 'draw' }, 'https://nasu-engineering.github.io/nasu_web/#/old'),
    'https://nasu-engineering.github.io/nasu_web/#/subjects/draw');
  assert.equal(hubUrl({ type: 'nope' }, 'https://x/'), null);
});

test('announcements carry an optional link', () => {
  assert.equal(normalizeAnnouncement({ id: 1, title: 't' }).link, null);
  assert.deepEqual(normalizeAnnouncement({ id: 1, link_type: 'resource', link_id: 7, link_subject_id: 'math1' }).link,
    { type: 'resource', id: '7', subjectId: 'math1' });
});
