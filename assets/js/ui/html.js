// Tiny auto-escaping template helper.
// Every interpolated value is HTML-escaped unless it is itself an html`` result
// (or wrapped in trusted()), so data can never inject markup.

class Trusted { constructor(s) { this.s = s; } toString() { return this.s; } }

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

// Only for markup authored in this codebase (e.g. icon SVG strings).
export const trusted = s => new Trusted(s);

function fmt(v) {
  if (v == null || v === false) return '';
  if (v instanceof Trusted) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return escape(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += fmt(values[i]) + strings[i + 1];
  return new Trusted(out);
}

export function mount(el, content) {
  el.innerHTML = fmt(content);
}
