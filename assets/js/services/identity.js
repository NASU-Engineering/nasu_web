// Helpers for the signed-in student's university identity. Pure functions
// (no DOM) so they can be unit-tested. UX only — never an access check.

/** True if the email belongs to the university domain (case-insensitive). */
export function isUniversityEmail(email, emailDomain) {
  if (typeof email !== 'string') return false;
  const e = email.trim().toLowerCase();
  const suffix = '@' + emailDomain.toLowerCase();
  return e.endsWith(suffix) && e.length > suffix.length && e.indexOf('@') === e.length - suffix.length;
}

/** Student ID (the part before @domain) from a university email, or null. */
export function studentIdFromEmail(email, emailDomain) {
  return isUniversityEmail(email, emailDomain)
    ? email.trim().toLowerCase().slice(0, -(emailDomain.length + 1))
    : null;
}
