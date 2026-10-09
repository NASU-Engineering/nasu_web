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
  // Applications, presence and engagement are reached only through admin/student RPCs.
  noMatch(/approved_students|university_students|form_responses|xp_events|quiz_questions|presence_heartbeats|activity_events/, 'private table names must not appear in shipped code');
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
  const calls = shipped.flatMap(f => f.text.match(/\.rpc\('get_my_profile'[^)]*\)/g) || []);
  assert.deepEqual(calls, [".rpc('get_my_profile')"]);
});

// The complete set of RPCs the browser may call. Adding one is a deliberate, reviewed change.
const ALLOWED_RPCS = [
  'get_my_profile', 'get_my_access', 'list_groups', 'list_my_content', 'get_content_item',
  'save_content_draft', 'submit_content_for_review', 'list_review_queue', 'review_content',
  'publish_content', 'get_admin_stats', 'admin_list_content', 'admin_search_members',
  'admin_grant_role', 'admin_revoke_role', 'admin_set_editor_scopes', 'admin_list_audit_log',
  // admin operations (supabase/prepared/20261010_02 + _04 — prepared, not applied)
  'record_presence', 'admin_activity_summary', 'admin_recent_activity', 'admin_application_summary',
  'admin_list_applications', 'admin_review_application', 'admin_data_integrity_summary',
  // engagement (supabase/prepared/20261010_03 — prepared, not applied)
  'get_my_progress', 'list_quizzes', 'get_quiz', 'start_quiz_attempt', 'submit_quiz_attempt',
  'list_activities', 'join_activity', 'leave_activity', 'get_leaderboard',
  'admin_list_quizzes', 'admin_list_activities', 'admin_engagement_stats',
].sort();

test('RPC calls only go through allowlisted names', () => {
  // Call sites: the literal get_my_profile call, and the workspace adapter's single rpc() helper.
  const sites = shipped.flatMap(f => (f.text.match(/\.rpc\([^)]*\)/g) || []).map(c => `${f.path.split(/[\\/]/).pop()}:${c}`));
  assert.deepEqual(sites.sort(), [
    "supabase-backend.js:.rpc('get_my_profile')",
    'supabase-engage.js:.rpc(name)',
    'supabase-engage.js:.rpc(name, args)',
    'supabase-ops.js:.rpc(name)',
    'supabase-ops.js:.rpc(name, args)',
    'supabase-workspace.js:.rpc(name)',
    'supabase-workspace.js:.rpc(name, args)',
  ]);
  const names = [];
  for (const [file, map] of [['supabase-workspace.js', 'RPC'], ['supabase-ops.js', 'OPS_RPC'], ['supabase-engage.js', 'ENGAGE_RPC']]) {
    const text = shipped.find(f => f.path.endsWith(file)).text;
    const block = text.match(new RegExp(`export const ${map} = \\{([\\s\\S]*?)\\};`))[1];
    names.push(...[...block.matchAll(/:\s*'([a-z_]+)'/g)].map(m => m[1]));
    assert.doesNotMatch(text, /\.rpc\(\s*['"`]/, `${file}: RPCs are called only via the RPC map`);
  }
  assert.deepEqual(['get_my_profile', ...names].sort(), ALLOWED_RPCS);
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

test('Storage: private content-files bucket, no overwrite, short signed URLs, no public URLs', () => {
  const ws = shipped.find(f => f.path.endsWith('supabase-workspace.js')).text;
  noMatch(/getPublicUrl|\/object\/public\//, 'the content bucket is private — never public URLs');
  noMatch(/upsert:\s*true/, 'uploads must never overwrite an existing object');
  assert.match(ws, /export const BUCKET = 'content-files';/);
  const storageFroms = shipped.flatMap(f => f.text.match(/storage\.from\([^)]*\)/g) || []);
  assert.ok(storageFroms.length > 0 && storageFroms.every(c => c === 'storage.from(BUCKET)'), `unexpected bucket use: ${storageFroms}`);
  assert.match(ws, /upsert:\s*false/);
  const secs = Number(ws.match(/SIGNED_URL_SECONDS = (\d+)/)?.[1]);
  assert.ok(secs > 0 && secs <= 300, 'signed URLs must be short-lived');
  // no table access other than Storage
  for (const f of shipped) assert.doesNotMatch(f.text.replace(/storage\.from\(BUCKET\)/g, ''), /(?<!Array)\.from\(/, f.path);
});

test('browser never writes audit rows and never grants the admin role', async () => {
  noMatch(/audit_logs/, 'audit entries are server-generated');
  const { ASSIGNABLE_ROLES } = await import('../assets/js/services/roles.js');
  assert.deepEqual([...ASSIGNABLE_ROLES].sort(), ['content_manager', 'section_editor']);
});

test('role simulator is isolated: mock backend only, admin-gated, no real permission changes', () => {
  const simText = shipped.find(f => /services[\\/]simulator\.js$/.test(f.path)).text;
  assert.doesNotMatch(simText, /from '\.\/supabase|getSupabase|\.rpc\(|\.storage\./, 'simulator never imports or calls the real backend');
  assert.deepEqual(simText.match(/^import .*$/gm), ["import { t } from '../i18n/index.js';", "import { hasRole } from './roles.js';"]);
  const apiText = shipped.find(f => /services[\\/]api\.js$/.test(f.path)).text;
  assert.match(apiText, /const be = \(\) => \(isSimulating\(\) \? mockBackend : realBackend\);/, 'simulation routes every call to the mock');
  assert.match(apiText, /if \(!isSimulating\(\) && !canUseSimulator\(realAccess, CONFIG\)\) throw new ApiError\('forbidden'/, 'entering requires real admin access');
  noMatch(/setDemoRoles\([^)]*\)[\s\S]{0,40}supabase/i, 'mock roles never reach Supabase');
  noMatch(/grantRole\([^)]*'admin'\)/, 'no code path grants the admin role');
});
