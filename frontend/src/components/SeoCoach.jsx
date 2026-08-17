import { useMemo } from 'react';

/**
 * Live SEO feedback beside a title and description field.
 *
 * Whoever writes a webinar or a report is deciding what Google shows and what a
 * WhatsApp card says, usually without knowing it — a blank description means
 * Google invents one from the page, and an over-long title is cut mid-word.
 * This shows the result while it is still being typed, so the writing can be
 * fixed rather than diagnosed weeks later.
 *
 * Advisory only. Nothing here blocks a save: a session with a rushed
 * description still has to go out.
 */

// Google renders roughly 600px of title and 960px of description, which lands
// near these counts for ordinary prose. They are guidance, not a rule — the
// real limit is pixels, and it varies with the words themselves.
const TITLE_IDEAL = [30, 60];
const DESC_IDEAL = [70, 160];

const countWords = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

/** Everything worth saying about one draft, in the order it matters. */
function review({ title, description, kind, extras, titleUnavailable }) {
  const t = String(title || '').trim();
  const d = String(description || '').trim();
  const notes = [];

  // ── Title ────────────────────────────────────────────────────────────────
  // Some editors do not own the title — a report takes it from the imported
  // document — so there is nothing useful to say and silence beats a warning
  // about a field the writer cannot change here.
  if (!t && titleUnavailable) {
    // deliberately no note
  } else if (!t) {
    notes.push({ level: 'bad', field: 'title', text: 'No title yet.' });
  } else if (t.length > TITLE_IDEAL[1]) {
    notes.push({
      level: 'warn',
      field: 'title',
      text: `${t.length} characters — Google usually cuts around ${TITLE_IDEAL[1]}, so the end may not be read.`,
    });
  } else if (t.length < TITLE_IDEAL[0]) {
    notes.push({
      level: 'warn',
      field: 'title',
      text: `Only ${t.length} characters. There is room to say what the session is about.`,
    });
  } else {
    notes.push({ level: 'good', field: 'title', text: `${t.length} characters — a good length.` });
  }

  // ── Description ──────────────────────────────────────────────────────────
  if (!d) {
    notes.push({
      level: 'bad',
      field: 'description',
      text: 'No description. Google will pick a sentence off the page instead, and the share card will fall back to generic text.',
    });
  } else if (d.length < DESC_IDEAL[0]) {
    notes.push({
      level: 'warn',
      field: 'description',
      text: `${d.length} characters. Under ${DESC_IDEAL[0]} tends to look thin next to other results.`,
    });
  } else if (d.length > DESC_IDEAL[1]) {
    notes.push({
      level: 'warn',
      field: 'description',
      text: `${d.length} characters — Google shows about ${DESC_IDEAL[1]}. Put the important part first.`,
    });
  } else {
    notes.push({ level: 'good', field: 'description', text: `${d.length} characters — a good length.` });
  }

  // ── Substance, not just length ───────────────────────────────────────────
  if (d && countWords(d) < 12) {
    notes.push({
      level: 'warn',
      field: 'description',
      text: 'Very few words. A sentence on what is covered and who it is for reads better than a label.',
    });
  }

  if (t && d && d.toLowerCase().startsWith(t.toLowerCase().slice(0, 20))) {
    notes.push({
      level: 'warn',
      field: 'description',
      text: 'The description repeats the title. Use it to add something the title does not say.',
    });
  }

  // Dates, names and places are what people actually type into a search box.
  const hay = `${t} ${d}`.toLowerCase();
  const missing = (extras || []).filter((x) => x.value && !hay.includes(String(x.value).toLowerCase().slice(0, 12)));
  missing.slice(0, 2).forEach((x) => {
    notes.push({
      level: 'tip',
      field: 'description',
      text: `${x.label} is not mentioned — searches often include it.`,
    });
  });

  if (kind === 'webinar' && d && !/\b(learn|cover|discuss|explain|understand|join|why|how|what)\b/i.test(d)) {
    notes.push({
      level: 'tip',
      field: 'description',
      text: 'Saying what someone will learn tends to draw more registrations than describing the topic alone.',
    });
  }

  return notes;
}

const TONE = {
  good: { dot: '#16a34a', bg: '#f0fdf4', bd: '#bbf7d0' },
  warn: { dot: '#d97706', bg: '#fffbeb', bd: '#fde68a' },
  bad: { dot: '#dc2626', bg: '#fef2f2', bd: '#fecaca' },
  tip: { dot: '#6366f1', bg: '#f5f3ff', bd: '#ddd6fe' },
};

export default function SeoCoach({
  title,
  description,
  kind = 'page',
  extras = [],
  siteName = 'Tiesverse',
  // Set where the title is written somewhere else (a report takes it from the
  // imported document), so the coach stays quiet about it.
  titleUnavailable = false,
}) {
  const notes = useMemo(
    () => review({ title, description, kind, extras, titleUnavailable }),
    [title, description, kind, extras, titleUnavailable],
  );

  const t = String(title || '').trim();
  const d = String(description || '').trim();

  // What Google will actually print, truncation and all.
  const shownTitle = t ? `${t} · ${siteName}` : `${siteName}`;
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

  const score = notes.some((n) => n.level === 'bad')
    ? 'Needs work'
    : notes.some((n) => n.level === 'warn')
      ? 'Almost there'
      : 'Looks good';
  const scoreTone = score === 'Needs work' ? TONE.bad : score === 'Almost there' ? TONE.warn : TONE.good;

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.headTitle}>How this will look in search</span>
        <span style={{ ...S.badge, background: scoreTone.bg, color: scoreTone.dot, borderColor: scoreTone.bd }}>
          {score}
        </span>
      </div>

      {/* A Google result, rendered the way Google renders it. */}
      <div style={S.serp}>
        <div style={S.serpUrl}>www.tiesverse.com › {kind === 'webinar' ? 'webinars' : kind === 'report' ? 'research' : 'events'}</div>
        <div style={S.serpTitle}>{clip(shownTitle, 60) || 'Untitled'}</div>
        <div style={S.serpDesc}>
          {d
            ? clip(d, 160)
            : <em style={{ color: '#9ca3af' }}>No description — Google will choose its own text from the page.</em>}
        </div>
      </div>

      <ul style={S.list}>
        {notes.map((n, i) => {
          const tone = TONE[n.level] || TONE.tip;
          return (
            <li key={i} style={S.item}>
              <span style={{ ...S.dot, background: tone.dot }} />
              <span>
                <strong style={S.field}>{n.field}</strong>
                {n.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const S = {
  wrap: {
    border: '1px solid var(--outline-variant, #e5e7eb)',
    borderRadius: 12,
    background: 'var(--surface, #fff)',
    padding: 14,
    marginTop: 12,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headTitle: { fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted, #6b7280)' },
  badge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, border: '1px solid' },
  serp: { padding: '11px 13px', border: '1px solid var(--outline-variant, #e5e7eb)', borderRadius: 9, background: '#fff', marginBottom: 12 },
  serpUrl: { fontSize: 12, color: '#4d5156', marginBottom: 3 },
  serpTitle: { fontSize: 18, lineHeight: 1.3, color: '#1a0dab', marginBottom: 3 },
  serpDesc: { fontSize: 13, lineHeight: 1.55, color: '#4d5156' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 },
  item: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-main, #111)' },
  dot: { width: 7, height: 7, borderRadius: '50%', marginTop: 6, flex: 'none' },
  field: { textTransform: 'capitalize', marginRight: 6, color: 'var(--text-muted, #6b7280)', fontWeight: 700 },
};
