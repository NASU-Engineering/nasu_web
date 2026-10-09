// Read-only reconciliation of the Google Forms responses, `applications`,
// `university_students` and `approved_students`. Pure functions — no I/O,
// no network, no database. Run through cli.mjs on LOCAL exports only.
//
// Privacy: nothing here returns a phone number. Student codes appear in the
// shareable report only as salted HMAC references (S-xxxxxxxx).

import { createHash, createHmac } from 'node:crypto';

/* ---------- CSV (RFC 4180: quotes, escaped quotes, commas/newlines in fields, BOM) ---------- */

export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Number every record (blank ones included) so __row matches the spreadsheet row.
  const isBlank = r => !r.some(v => v.trim() !== '');
  const headerIndex = rows.findIndex(r => !isBlank(r));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex].map(h => h.trim());
  return rows.slice(headerIndex + 1)
    .map((r, i) => ({ r, row: i + 2 })) // header = row 1
    .filter(({ r }) => !isBlank(r))
    .map(({ r, row }) => {
      const o = { __row: row };
      header.forEach((h, j) => { o[h] = (r[j] ?? '').trim(); });
      return o;
    });
}

/* ---------- normalisation ---------- */

const ARABIC_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
export const latinDigits = v => String(v ?? '').replace(/[٠-٩۰-۹]/g, d => ARABIC_DIGITS[d]);

/** Student code: Latin digits, no spaces, upper-case. '' when blank. */
export function normalizeCode(v) {
  return latinDigits(v).replace(/\s+/g, '').toUpperCase();
}

const EG_MOBILE_PREFIX = /^1[0125]$/; // 010, 011, 012, 015 networks

/**
 * Normalises a phone number to E.164 text.
 *  → { e164: '+201XXXXXXXXX' | null, status: 'ok' | 'blank' | 'review', reason }
 * Accepts the forms seen in forms and in bigint columns (which lose the leading 0):
 *   01012345678 · 1012345678 · 201012345678 · +20 101 234 5678 · 00201012345678 · Arabic digits
 */
export function normalizePhone(raw) {
  const original = latinDigits(raw).trim();
  if (!original) return { e164: null, status: 'blank', reason: 'blank' };
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(original)) return { e164: null, status: 'review', reason: 'scientific notation (spreadsheet rounding)' };
  if (/[a-z]/i.test(original)) return { e164: null, status: 'review', reason: 'contains letters' };
  let d = original.replace(/[^\d+]/g, '');
  const plus = d.startsWith('+');
  d = d.replace(/\+/g, '');
  if (!plus && d.startsWith('00')) d = d.slice(2); // international 00 prefix

  let national = null;
  if (d.length === 11 && d.startsWith('0')) national = d.slice(1);            // 01XXXXXXXXX
  else if (d.length === 10 && d.startsWith('1')) national = d;                 // bigint lost the 0
  else if (d.length === 12 && d.startsWith('20')) national = d.slice(2);       // 201XXXXXXXXX
  else if (d.length === 13 && d.startsWith('200')) national = d.slice(3);      // +20 0… typo
  if (national && national.length === 10 && EG_MOBILE_PREFIX.test(national.slice(0, 2))) {
    return { e164: `+20${national}`, status: 'ok', reason: 'egyptian mobile' };
  }
  if ((plus || original.startsWith('00')) && /^[1-9]\d{7,14}$/.test(d) && !d.startsWith('20')) {
    return { e164: null, status: 'review', reason: 'non-Egyptian number — confirm country and format' };
  }
  return { e164: null, status: 'review', reason: `unexpected length/prefix (${d.length} digits)` };
}

/** Last two digits only, for operator-only detail files. */
export const maskPhone = e164 => (e164 ? `…${e164.slice(-2)}` : '');

/** Salted, non-reversible reference for a student code (shareable). */
export function codeRef(code, salt) {
  if (!salt || salt.length < 16) throw new Error('A secret salt of at least 16 characters is required (RECONCILE_SALT).');
  return 'S-' + createHmac('sha256', salt).update(code).digest('hex').slice(0, 8);
}

/* ---------- column mapping ---------- */

/** Picks the first header matching any pattern (case-insensitive), or an explicit name. */
export function pickColumn(rows, explicit, patterns) {
  if (!rows.length) return explicit || null;
  const headers = Object.keys(rows[0]).filter(h => h !== '__row');
  if (explicit) {
    if (!headers.includes(explicit)) throw new Error(`Column "${explicit}" not found. Available: ${headers.join(', ')}`);
    return explicit;
  }
  return headers.find(h => patterns.some(p => p.test(h))) || null;
}

/* ---------- reconciliation ---------- */

const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

/**
 * @param data { responses, applications, approved, roster } — arrays of row objects
 * @param cols {
 *   responseCode, responsePhone, responseTime,
 *   appId, appCode, appPhone,
 *   approvedId, approvedCode, approvedPhone, approvedAppId (optional link column),
 *   rosterCode }
 * Returns { counts, lists } where each list item holds codes/ids and statuses — never phones.
 */
export function reconcile({ responses, applications, approved, roster }, cols) {
  const rCode = r => normalizeCode(r[cols.responseCode]);
  const aCode = r => normalizeCode(r[cols.appCode]);
  const pCode = r => normalizeCode(r[cols.approvedCode]);
  const uCode = r => normalizeCode(r[cols.rosterCode]);

  const respByCode = groupBy(responses, rCode);
  const appByCode = groupBy(applications, aCode);
  const appById = new Map(applications.map(a => [String(a[cols.appId] ?? ''), a]));
  const rosterCodes = new Set(roster.map(uCode).filter(Boolean));
  const approvedByCode = groupBy(approved, pCode);

  const blankResponses = responses.filter(r => !rCode(r));
  const duplicateResponseCodes = [...respByCode].filter(([, rs]) => rs.length > 1);

  const csvNotInApplications = [...respByCode.keys()].filter(c => !appByCode.has(c))
    .map(code => ({ code, inRoster: rosterCodes.has(code), responses: respByCode.get(code).length, rows: respByCode.get(code).map(r => r.__row) }));
  const applicationsNotInCsv = [...appByCode.keys()].filter(c => !respByCode.has(c))
    .map(code => ({ code, inRoster: rosterCodes.has(code), applicationIds: appByCode.get(code).map(a => String(a[cols.appId] ?? '')) }));
  const duplicateApplications = [...appByCode].filter(([, as]) => as.length > 1)
    .map(([code, as]) => ({ code, applicationIds: as.map(a => String(a[cols.appId] ?? '')) }));
  const duplicateApprovals = [...approvedByCode].filter(([, ps]) => ps.length > 1)
    .map(([code, ps]) => ({ code, approvedIds: ps.map(p => String(p[cols.approvedId] ?? '')) }));

  // Link each approved student to its application: explicit link column first, else by code.
  const phoneBackfill = [];
  const phoneReview = [];
  const approvedWithoutApplication = [];
  const approvedNotInRoster = [];
  const linkCodeMismatch = [];
  let approvedWithPhone = 0;

  for (const p of approved) {
    const code = pCode(p);
    const id = String(p[cols.approvedId] ?? '');
    if (code && !rosterCodes.has(code)) approvedNotInRoster.push({ code, approvedId: id });
    const linkId = cols.approvedAppId ? String(p[cols.approvedAppId] ?? '') : '';
    const app = linkId ? appById.get(linkId) : (appByCode.get(code) || [])[0];
    if (!app) { approvedWithoutApplication.push({ code, approvedId: id, linkId: linkId || null }); continue; }
    if (linkId && aCode(app) !== code) linkCodeMismatch.push({ code, approvedId: id, applicationCode: aCode(app) });

    const current = normalizePhone(p[cols.approvedPhone]);
    if (current.status !== 'blank') { approvedWithPhone++; continue; }
    const fromApp = normalizePhone(app[cols.appPhone]);
    if (fromApp.status === 'ok') phoneBackfill.push({ code, approvedId: id, applicationId: String(app[cols.appId] ?? '') , e164: fromApp.e164 });
    else phoneReview.push({ code, approvedId: id, applicationId: String(app[cols.appId] ?? ''), reason: fromApp.reason });
  }

  return {
    counts: {
      responses: responses.length,
      responsesBlankCode: blankResponses.length,
      responsesUniqueCodes: respByCode.size,
      responseCodesWithDuplicates: duplicateResponseCodes.length,
      applications: applications.length,
      applicationsUniqueCodes: appByCode.size,
      approved: approved.length,
      roster: rosterCodes.size,
      csvCodesMissingFromApplications: csvNotInApplications.length,
      csvCodesMissingFromApplicationsButInRoster: csvNotInApplications.filter(x => x.inRoster).length,
      applicationsMissingFromCsv: applicationsNotInCsv.length,
      duplicateApplications: duplicateApplications.length,
      duplicateApprovals: duplicateApprovals.length,
      approvedWithPhone,
      approvedPhoneBackfillable: phoneBackfill.length,
      approvedPhoneNeedsReview: phoneReview.length,
      approvedWithoutApplication: approvedWithoutApplication.length,
      approvedNotInRoster: approvedNotInRoster.length,
      approvedLinkCodeMismatch: linkCodeMismatch.length,
    },
    lists: {
      blankResponseRows: blankResponses.map(r => r.__row),
      duplicateResponseCodes: duplicateResponseCodes.map(([code, rs]) => ({ code, rows: rs.map(r => r.__row) })),
      csvNotInApplications, applicationsNotInCsv, duplicateApplications, duplicateApprovals,
      phoneBackfill, phoneReview, approvedWithoutApplication, approvedNotInRoster, linkCodeMismatch,
    },
  };
}

/* ---------- reports ---------- */

/** Shareable Markdown: counts + salted references only. No codes, no phones. */
export function shareableReport(result, salt, meta = {}) {
  const ref = c => codeRef(c, salt);
  const c = result.counts;
  const L = result.lists;
  const line = (label, n) => `| ${label} | ${n} |`;
  const refs = (items, fmt) => (items.length ? items.map(fmt).join('\n') : '_none_');
  return `# Reconciliation report (read-only)

Generated: ${meta.generatedAt || new Date().toISOString()}
Inputs: ${meta.inputs || 'local exports'}

Student codes are shown only as salted references (S-xxxxxxxx). Phone numbers are never included.
Re-identify references with the private details file on the operator's machine.

## Counts

| Check | Count |
|---|---|
${[
  line('Form responses', c.responses),
  line('… with blank student code', c.responsesBlankCode),
  line('… unique non-blank codes', c.responsesUniqueCodes),
  line('… codes submitted more than once', c.responseCodesWithDuplicates),
  line('applications', c.applications),
  line('… unique codes', c.applicationsUniqueCodes),
  line('university roster codes', c.roster),
  line('approved_students', c.approved),
  line('Form codes missing from applications', c.csvCodesMissingFromApplications),
  line('… of which found in the roster', c.csvCodesMissingFromApplicationsButInRoster),
  line('applications whose code is not in the form export', c.applicationsMissingFromCsv),
  line('codes with more than one application', c.duplicateApplications),
  line('codes approved more than once', c.duplicateApprovals),
  line('approved students without a linked application', c.approvedWithoutApplication),
  line('approved students not in the roster', c.approvedNotInRoster),
  line('approved ↔ application code mismatches (link column)', c.approvedLinkCodeMismatch),
  line('approved students already with a WhatsApp number', c.approvedWithPhone),
  line('WhatsApp numbers recoverable from the application', c.approvedPhoneBackfillable),
  line('WhatsApp numbers needing manual review', c.approvedPhoneNeedsReview),
].join('\n')}

## Needs a decision (references only)

### Form codes missing from applications
${refs(L.csvNotInApplications, x => `- ${ref(x.code)} — ${x.responses} response(s), ${x.inRoster ? 'in roster' : 'NOT in roster'}`)}

### Applications not in the form export
${refs(L.applicationsNotInCsv, x => `- ${ref(x.code)} — ${x.applicationIds.length} application(s), ${x.inRoster ? 'in roster' : 'NOT in roster'}`)}

### Phone numbers needing manual review
${refs(L.phoneReview, x => `- ${ref(x.code)} — ${x.reason}`)}

### Approved students without a linked application
${refs(L.approvedWithoutApplication, x => `- ${ref(x.code)}`)}

### Approved students not in the roster
${refs(L.approvedNotInRoster, x => `- ${ref(x.code)}`)}

Nothing is approved, changed or written by this tool.
`;
}

/** Operator-only CSV (keep private, never commit or share): codes + statuses, masked phones. */
export function privateDetailsCsv(result, salt) {
  const L = result.lists;
  const rows = [['category', 'reference', 'student_code', 'record_ids', 'detail']];
  const add = (category, code, ids, detail) => rows.push([category, codeRef(code, salt), code, ids, detail]);
  L.csvNotInApplications.forEach(x => add('form_code_missing_from_applications', x.code, `rows ${x.rows.join(' ')}`, x.inRoster ? 'in roster' : 'not in roster'));
  L.applicationsNotInCsv.forEach(x => add('application_not_in_form_export', x.code, x.applicationIds.join(' '), x.inRoster ? 'in roster' : 'not in roster'));
  L.duplicateApplications.forEach(x => add('duplicate_applications', x.code, x.applicationIds.join(' '), ''));
  L.duplicateApprovals.forEach(x => add('duplicate_approvals', x.code, x.approvedIds.join(' '), ''));
  L.phoneBackfill.forEach(x => add('phone_backfill_candidate', x.code, `approved ${x.approvedId} ← application ${x.applicationId}`, `normalised ${maskPhone(x.e164)}`));
  L.phoneReview.forEach(x => add('phone_needs_review', x.code, `approved ${x.approvedId} / application ${x.applicationId}`, x.reason));
  L.approvedWithoutApplication.forEach(x => add('approved_without_application', x.code, x.approvedId, x.linkId ? `link ${x.linkId} not found` : 'no link'));
  L.approvedNotInRoster.forEach(x => add('approved_not_in_roster', x.code, x.approvedId, ''));
  L.linkCodeMismatch.forEach(x => add('link_code_mismatch', x.code, x.approvedId, `application code ${x.applicationCode}`));
  const esc = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return rows.map(r => r.map(esc).join(',')).join('\n') + '\n';
}

/* ---------- sources, conflicts and intake export (added 2026-10-10) ---------- */


const normName = v => latinDigits(v).trim().replace(/\s+/g, ' ').toLowerCase();
const normTime = v => {
  const s = String(v ?? '').trim();
  const d = new Date(s);
  return isNaN(d) ? s : d.toISOString();
};

/**
 * Stable id for a form response that has no Google response id (CSV/Sheet exports):
 * hash of timestamp + raw code + name. Re-exports produce the same id, so loading
 * twice is a no-op (intake is idempotent by this id).
 */
export function responseKey(row, cols) {
  const basis = [normTime(row[cols.responseTime]), String(row[cols.responseCode] ?? '').trim(), normName(row[cols.responseName])].join('|');
  return 'csv:' + createHash('sha256').update(basis).digest('hex').slice(0, 24);
}

/** CSV export vs Google Sheet: rows present in one and not the other (by responseKey). */
export function compareSources(csvRows, sheetRows, cols) {
  const keys = rows => new Map(rows.map(r => [responseKey(r, cols), r]));
  const a = keys(csvRows);
  const b = keys(sheetRows);
  const onlyCsv = [...a].filter(([k]) => !b.has(k)).map(([, r]) => r);
  const onlySheet = [...b].filter(([k]) => !a.has(k)).map(([, r]) => r);
  return {
    counts: { csvRows: csvRows.length, sheetRows: sheetRows.length, missingFromSheet: onlyCsv.length, missingFromCsv: onlySheet.length },
    lists: {
      missingFromSheet: onlyCsv.map(r => ({ code: normalizeCode(r[cols.responseCode]), row: r.__row, time: normTime(r[cols.responseTime]) })),
      missingFromCsv: onlySheet.map(r => ({ code: normalizeCode(r[cols.responseCode]), row: r.__row, time: normTime(r[cols.responseTime]) })),
    },
  };
}

/**
 * Data-quality checks on the responses:
 *   invalid   — non-blank codes that don't match the expected format
 *   conflicts — one code submitted with different names or phone numbers
 *               (and, when applications are given, a name that differs from the application)
 */
export function responseIssues(responses, cols, { codePattern = /^[A-Z0-9-]{4,20}$/, applications = [], appCols = {} } = {}) {
  const invalid = responses.filter(r => { const c = normalizeCode(r[cols.responseCode]); return c && !codePattern.test(c); })
    .map(r => ({ code: normalizeCode(r[cols.responseCode]), row: r.__row }));
  const byCode = groupBy(responses, r => normalizeCode(r[cols.responseCode]));
  const appByCode = groupBy(applications, r => normalizeCode(r[appCols.appCode]));
  const conflicts = [];
  for (const [code, rows] of byCode) {
    const names = new Set(rows.map(r => normName(r[cols.responseName])).filter(Boolean));
    const phones = new Set(rows.map(r => normalizePhone(r[cols.responsePhone]).e164 || latinDigits(r[cols.responsePhone]).replace(/\D/g, '')).filter(Boolean));
    const appNames = new Set((appByCode.get(code) || []).map(a => normName(a[appCols.appName])).filter(Boolean));
    const kinds = [];
    if (names.size > 1) kinds.push('name differs between responses');
    if (phones.size > 1) kinds.push('phone differs between responses');
    if (appNames.size && names.size && ![...names].some(n => appNames.has(n))) kinds.push('name differs from application');
    if (kinds.length) conflicts.push({ code, rows: rows.map(r => r.__row), kinds });
  }
  return { counts: { invalidCodes: invalid.length, conflictingCodes: conflicts.length }, lists: { invalid, conflicts } };
}

const sqlText = v => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

/**
 * PRIVATE output: SQL that loads chosen responses into the review workflow through
 * public.ingest_form_response (idempotent — re-running is a no-op). It never
 * approves anyone; unmatched codes become 'needs_review'. Keep in out/private/.
 */
export function intakeSql(responses, cols, { formId = 'google-form', only = null } = {}) {
  const header = Object.keys(responses[0] || {}).filter(h => h !== '__row');
  const lines = [
    '-- PRIVATE — contains student answers. Run only after approval, as the database owner, on staging first.',
    '-- Idempotent: each response has a stable id; running twice changes nothing.',
    'begin;',
  ];
  for (const r of responses) {
    const code = normalizeCode(r[cols.responseCode]);
    if (only && !only.has(code)) continue;
    const payload = Object.fromEntries(header.map(h => [h, r[h]]));
    payload.student_code = r[cols.responseCode] ?? '';
    if (cols.responseName) payload.full_name = r[cols.responseName] ?? '';
    const ts = normTime(r[cols.responseTime]);
    lines.push(`select public.ingest_form_response(${sqlText(responseKey(r, cols))}, ${sqlText(formId)}, ${/^\d{4}-/.test(ts) ? sqlText(ts) + '::timestamptz' : 'null'}, ${sqlText(JSON.stringify(payload))}::jsonb, 'csv_reconcile', ${Number(r.__row) || 'null'});`);
  }
  lines.push('-- review the output above, then:', 'commit;');
  return lines.join('\n') + '\n';
}

/** Extra shareable sections (sources, invalid codes, conflicts) — references only. */
export function shareableExtras({ sources, issues }, salt) {
  const ref = c => (c ? codeRef(c, salt) : '(blank)');
  const out = [];
  if (sources) {
    out.push('## Form export vs Google Sheet', '', '| Check | Count |', '|---|---|',
      `| Rows in the form export | ${sources.counts.csvRows} |`, `| Rows in the Google Sheet | ${sources.counts.sheetRows} |`,
      `| In the export but missing from the Sheet | ${sources.counts.missingFromSheet} |`,
      `| In the Sheet but missing from the export | ${sources.counts.missingFromCsv} |`, '',
      ...(sources.lists.missingFromSheet.length ? sources.lists.missingFromSheet.map(x => `- export row ${x.row} (${x.time.slice(0, 10)}) — ${ref(x.code)}`) : ['_none_']), '');
  }
  if (issues) {
    out.push('## Data quality', '', '| Check | Count |', '|---|---|',
      `| Codes with an invalid format | ${issues.counts.invalidCodes} |`, `| Codes with conflicting details | ${issues.counts.conflictingCodes} |`, '',
      ...(issues.lists.conflicts.length ? issues.lists.conflicts.map(x => `- ${ref(x.code)} — rows ${x.rows.join(', ')}: ${x.kinds.join('; ')}`) : ['_no conflicts_']), '');
  }
  return out.join('\n');
}
