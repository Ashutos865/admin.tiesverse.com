/* Small shared formatters. */

/* Dates in a message list follow what people actually scan for: a time if it
   arrived today, a weekday within the week, otherwise a date. */
export function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = Math.floor((now - d) / 86400000);
  if (days < 7 && days >= 0) return d.toLocaleDateString([], { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });
}

export function fullDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/* "2 hours ago" up to a week, then a plain date — relative time stops being
   useful once it needs arithmetic to understand. */
export function relative(value) {
  if (!value) return '';
  const d = new Date(value);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (secs < 86400) {
    const h = Math.floor(secs / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (secs < 604800) {
    const days = Math.floor(secs / 86400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return fullDate(value);
}

export function fileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* A sender's display name from "Name <addr>" or a bare address. */
export function nameOf(value) {
  const raw = (value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return m[1].trim();
  return raw.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function addressOf(value) {
  const raw = (value || '').trim();
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

export function initials(value) {
  const name = nameOf(value);
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/* A stable colour per person, so the same sender keeps the same avatar tint
   between sessions without storing anything. */
const AVATAR_HUES = ['#7c3aed', '#2563eb', '#067a50', '#b45309', '#be185d', '#0891b2', '#c02626'];
export function avatarColor(seed) {
  const s = String(seed || '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

export function categoryClass(label) {
  const key = String(label || '').toLowerCase().trim();
  const known = ['partnerships', 'media', 'careers', 'support', 'events'];
  return known.includes(key) ? `chip-${key}` : 'chip-default';
}
