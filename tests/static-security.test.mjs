// Static checks over everything shipped to the browser. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
function files(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const shipped = [join(root, 'index.html'), ...files(join(root, 'assets'))]
  .map(path => ({ path, text: readFileSync(path, 'utf8') }));

function noMatch(re, why) {
  const hits = shipped.filter(f => re.test(f.text)).map(f => f.path);
  assert.deepEqual(hits, [], why);
}

test('no service-role / secret keys or JWTs', () => {
  noMatch(/service[_-]?role/i, 'service_role must never be in frontend code');
  noMatch(/sb_secret_/, 'Supabase secret keys must never be in frontend code');
  noMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'no embedded JWTs (legacy anon/service keys)');
});

test('only the publishable key is configured', () => {
  const keys = shipped.flatMap(f => f.text.match(/sb_[a-z]+_[A-Za-z0-9_]+/g) || []);
  assert.ok(keys.every(k => k.startsWith('sb_publishable_')), `unexpected key types: ${keys}`);
});

test('no direct access to private tables', () => {
  noMatch(/approved_students|university_students|\bapplications\b/, 'private table names must not appear in shipped code');
  noMatch(/\.from\(\s*['"`]/, 'no direct table queries from the browser yet');
});

test('legacy hard-coded admin password is gone', () => {
  noMatch(/ADMIN_PASSWORD|prepyear2026/i, 'client-side admin password must not exist');
});

test('legacy password / OTP / activation-code auth is gone', () => {
  noMatch(/signInWithPassword|signUp\(|verifyOtp|signInWithOtp|updateUser|resetPasswordForEmail/, 'Microsoft SSO is the only sign-in method');
  noMatch(/type="password"|autocomplete="(current|new)-password"|one-time-code/, 'no password or code inputs');
  noMatch(/loginEmailTemplate|activation_token|request-activation|\bactivation_code\b/, 'old activation contract must be removed');
});

test('sign-in uses Supabase OAuth with the Azure provider only', () => {
  const oauth = shipped.filter(f => /signInWithOAuth\(/.test(f.text));
  assert.equal(oauth.length, 1, 'exactly one signInWithOAuth call site');
  const config = shipped.find(f => f.path.endsWith('config.js')).text;
  assert.match(config, /provider:\s*'azure'/);
});

test('profile is only fetched via get_my_profile with no arguments', () => {
  const calls = shipped.flatMap(f => f.text.match(/\.rpc\([^)]*\)/g) || []);
  assert.deepEqual(calls, [".rpc('get_my_profile')"]);
});

test('shipped config uses the real backend, not the dev mock', () => {
  const config = shipped.find(f => f.path.endsWith('config.js')).text;
  assert.match(config, /backend:\s*'supabase'/);
});

test('no identity-based authorization (roles come only from the backend)', () => {
  noMatch(/gasser|omar/i, 'no hard-coded people / admin emails in frontend code');
  noMatch(/roles\s*=\s*\[\s*['"](admin|content_manager|section_editor)['"]/, 'roles must not be hard-coded outside the mock');
});

test('every staff route is role-guarded in the router', () => {
  const app = shipped.find(f => f.path.endsWith('app.js')).text;
  const staff = app.split('\n').filter(l => /path:\s*'\/(editor|review|admin)/.test(l));
  assert.ok(staff.length >= 15, 'staff routes present');
  for (const line of staff) assert.match(line, /roles:\s*(EDITOR|REVIEWER|ADMIN)|redirect:/, line.trim());
});

test('workspace backend calls are not wired to guessed tables or RPCs', () => {
  const ws = shipped.find(f => f.path.endsWith('supabase-workspace.js')).text;
  assert.doesNotMatch(ws, /\.rpc\(|\.from\(|\.storage\b/, 'connect only once the backend contract is agreed');
});
