// Frontend configuration.
//
// EVERYTHING IN THIS FILE IS PUBLIC — it is shipped to every browser.
// Only the project URL and the publishable key belong here. Never add a
// privileged/secret API key, database password or any student data.

export const CONFIG = {
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

  // Content uploads (Editor workspace). UX pre-checks only — PROVISIONAL until
  // the backend confirms its Storage limits; the server is authoritative.
  uploads: {
    maxMb: 50,
    accept: ['.pdf', '.pptx', '.ppt', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.zip'],
  },

  // Legacy resource list from the original site, still read by the mock content.
  legacyResourcesUrl: 'resources.json',
};
