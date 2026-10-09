// Frontend configuration.
//
// EVERYTHING IN THIS FILE IS PUBLIC — it is shipped to every browser.
// Only the project URL and the publishable key belong here. Never add a
// privileged/secret API key, database password or any student data.

export const CONFIG = {
  // 'production' | 'staging' | 'preview'. Shown to admins; staging and preview
  // get a banner. 'preview' must use backend: 'mock' (synthetic data only).
  environment: 'production',

  // Shown in Admin → Settings → General.
  academicYear: '2026/2027',

  // 'supabase' → real backend (services/supabase-backend.js)
  // 'mock'     → DEV ONLY: local fake data, no real accounts (services/mock-backend.js)
  backend: 'supabase',

  supabase: {
    url: 'https://hfrnfkmlqxnajocxkzpq.supabase.co',
    publishableKey: 'sb_publishable_NOxga9PRdHklzoNQmBtDCA_h8my5mML',

    // supabase-js, loaded from the CDN only when backend === 'supabase'.
    clientUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm',
  },

  // Sign-in is NASU Microsoft (Azure / Entra ID) SSO only, via Supabase OAuth.
  auth: {
    provider: 'azure',
    scopes: 'email profile', // Supabase adds 'openid' itself
    // UX only — who may actually sign in is decided by the backend.
    emailDomain: 'nasu.edu.eg',
    // Sent to Microsoft to pre-select the NASU tenant and let students pick
    // the right account on shared devices.
    queryParams: { domain_hint: 'nasu.edu.eg', prompt: 'select_account' },
  },

  // Where subjects/resources/announcements come from when backend === 'supabase'.
  // 'mock' keeps sample content (with a "Preview" banner) until content tables exist.
  contentSource: 'mock',

  // When true, subjects, resources, search and announcements require a signed-in student.
  requireLoginForContent: true,

  // Content uploads (Editor workspace). UX pre-checks mirroring the backend's
  // 'content-files' bucket (50 MiB; PDF, images, Office, plain text).
  // Storage RLS and bucket settings are authoritative.
  uploads: {
    maxMb: 50,
    accept: ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'],
  },

  // Admin testing tools. The role simulator only ever uses mock data (see
  // services/simulator.js); set to false to hide it.
  features: {
    roleSimulator: true,
    // Quizzes, Activities, XP and Leaderboards. Off until the engagement
    // migration (supabase/prepared/20261010_03_engagement.sql) is approved and
    // applied; while off the Hub says "not live yet" and calls nothing.
    engagement: false,
    // Online-presence heartbeat (record_presence, migration 20261010_02). Off
    // until that migration is applied; the admin then sees "Not collected".
    presence: false,
  },

  // Legacy resource list from the original site, still read by the mock content.
  legacyResourcesUrl: 'resources.json',
};
