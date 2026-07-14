import {
  Type, AlignLeft, CircleDot, CheckSquare, ChevronDownSquare,
  Hash, Mail, Phone, Calendar, Clock, Star, Heading, Text, Upload, Link2,
} from 'lucide-react';

// Every field type the builder can add. `hasOptions` fields carry a choice list;
// `static` fields (heading/paragraph) collect no answer.
export const FIELD_TYPES = [
  { type: 'short_text',      label: 'Short answer',    icon: Type,              group: 'text' },
  { type: 'long_text',       label: 'Paragraph',       icon: AlignLeft,         group: 'text' },
  { type: 'multiple_choice', label: 'Multiple choice', icon: CircleDot,         group: 'choice', hasOptions: true },
  { type: 'checkboxes',      label: 'Checkboxes',      icon: CheckSquare,       group: 'choice', hasOptions: true },
  { type: 'dropdown',        label: 'Dropdown',        icon: ChevronDownSquare, group: 'choice', hasOptions: true },
  { type: 'number',          label: 'Number',          icon: Hash,              group: 'text' },
  { type: 'email',           label: 'Email',           icon: Mail,              group: 'text' },
  { type: 'phone',           label: 'Phone',           icon: Phone,             group: 'text' },
  { type: 'url',             label: 'Website / link',  icon: Link2,             group: 'text' },
  { type: 'date',            label: 'Date',            icon: Calendar,          group: 'text' },
  { type: 'time',            label: 'Time',            icon: Clock,             group: 'text' },
  { type: 'rating',          label: 'Rating',          icon: Star,              group: 'choice' },
  { type: 'file',            label: 'File upload',     icon: Upload,            group: 'text' },
  { type: 'heading',         label: 'Section heading', icon: Heading,           group: 'layout', static: true },
  { type: 'paragraph',       label: 'Text block',      icon: Text,              group: 'layout', static: true },
];

export const FIELD_META = Object.fromEntries(FIELD_TYPES.map(f => [f.type, f]));

export const isStatic = (type) => Boolean(FIELD_META[type]?.static);
export const hasOptions = (type) => Boolean(FIELD_META[type]?.hasOptions);

const uid = () =>
  `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// A page in a multi-step form. `banner` empty = inherit the global header image;
// set it (upload or external URL) to override for this page.
export function newPage(n = 1) {
  return {
    id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    description: '',
    banner: '',
    next_text: 'Next',
  };
}

// A brand-new field of a given type, pre-filled with sensible defaults.
export function newField(type) {
  const meta = FIELD_META[type] || FIELD_META.short_text;
  const base = { id: uid(), type, label: '', help: '', required: false };
  if (meta.hasOptions) base.options = ['Option 1', 'Option 2'];
  if (type === 'rating') base.scale = 5;
  if (type === 'heading') base.label = 'Section title';
  if (type === 'paragraph') base.label = 'Add descriptive text here.';
  return base;
}

export const FONT_OPTIONS = [
  { id: 'system', label: 'System (SF/Segoe)', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id: 'serif',  label: 'Serif (Georgia)',   stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono',   label: 'Mono',              stack: '"SF Mono", ui-monospace, Menlo, monospace' },
  { id: 'grotesk',label: 'Grotesk',           stack: '"Hanken Grotesk", "Segoe UI", sans-serif' },
];
export const fontStack = (id) => (FONT_OPTIONS.find(f => f.id === id) || FONT_OPTIONS[0]).stack;

export const DEFAULT_THEME = {
  bg_type: 'color',     // 'color' | 'image' | 'gradient'
  bg_color: '#f4f5f7',
  bg_image: '',
  bg_gradient: 'linear-gradient(135deg,#fff7ed,#ffedd5)',
  accent: '#fe7a00',
  font: 'system',
  layout: 'card',       // 'card' | 'plain'
  button_text: 'Submit',
  header_image: '',
};

// Public forms are served on their own subdomain (with the branded UI).
export const PUBLIC_FORMS_ORIGIN = (import.meta.env.VITE_FORMS_URL || 'https://forms.tiesverse.com').replace(/\/$/, '');

export const DEFAULT_SETTINGS = {
  accepting: true,
  require_login: false,
  one_response: false,
  collect_email: false,
  anonymous: false,          // for reviews/feedback: don't ask name & email on the public form
  thank_you: 'Thanks — your response has been recorded.',
  thank_you_title: 'All done!',
  thank_you_emoji: '🎉',
  thank_you_button_text: '',
  thank_you_button_url: '',
  show_footer: true,          // the "Made with ❤️ with Tech" bar
  close_date: '',
  multi_page: false,
  pages: [],           // [{id, title, description, banner, next_text}]
  send_confirmation: true,   // email the submitter a receipt
  from_email: '',            // sender alias for the confirmation (blank = system default)
  from_name: '',             // optional display name for the sender
};

// How many pages the form renders as (always ≥ 1).
export const pageCount = (settings) => {
  const s = mergeSettings(settings);
  return s.multi_page ? Math.max(1, (s.pages || []).length) : 1;
};

// The page index a field lives on, clamped to the valid range.
export const fieldPage = (field, count) => {
  const p = Number.isInteger(field?.page) ? field.page : 0;
  return Math.min(Math.max(p, 0), Math.max(0, count - 1));
};

export function blankForm() {
  return {
    title: 'Untitled form',
    description: '',
    schema: [],
    theme: { ...DEFAULT_THEME },
    settings: { ...DEFAULT_SETTINGS },
    visibility: 'internal',
    is_published: false,
  };
}

// Merge stored (possibly partial) JSON with defaults so old forms never crash.
export const mergeTheme = (t) => ({ ...DEFAULT_THEME, ...(t || {}) });
export const mergeSettings = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}) });
