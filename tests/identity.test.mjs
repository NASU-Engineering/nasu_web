// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUniversityEmail, studentIdFromEmail } from '../assets/js/services/identity.js';

const D = 'nasu.edu.eg';

test('recognises university accounts case-insensitively', () => {
  assert.equal(isUniversityEmail('20250001@nasu.edu.eg', D), true);
  assert.equal(isUniversityEmail(' 20250001@NASU.EDU.EG ', D), true);
});

test('rejects other domains and look-alikes', () => {
  for (const bad of ['x@gmail.com', 'x@nasu.edu.eg.evil.com', 'x@sub.nasu.edu.eg', 'x@evilnasu.edu.eg',
    '@nasu.edu.eg', 'a@b@nasu.edu.eg', 'nasu.edu.eg', '', null, undefined, 42]) {
    assert.equal(isUniversityEmail(bad, D), false, `should reject ${String(bad)}`);
    assert.equal(studentIdFromEmail(bad, D), null);
  }
});

test('reads the Student ID from the university email', () => {
  assert.equal(studentIdFromEmail('20250001@nasu.edu.eg', D), '20250001');
  assert.equal(studentIdFromEmail('AbC.12@Nasu.edu.eg', D), 'abc.12');
});
