export const newCertificateVariable = (name) => ({
  name,
  label: name.replaceAll('_', ' '),
  type: 'text',
  required: true,
  default_value: '',
  sample_value: '',
  description: '',
  generator_enabled: false,
  generator_pattern: '',
});

export const newCertificateElement = (pageNumber, zIndex, name = `field_${zIndex}`) => ({
  id: crypto.randomUUID(),
  page_number: pageNumber,
  element_type: 'text',
  content: `{{${name}}}`,
  image_src: null,
  image_alt: null,
  hyperlink_url: '',
  x: 120,
  y: 120,
  width: 260,
  height: 54,
  font_family: 'Helvetica',
  font_size: 28,
  font_weight: '400',
  font_style: 'normal',
  is_bold: false,
  is_italic: false,
  is_underline: false,
  is_strikethrough: false,
  text_color: '#111827',
  background_color: null,
  text_opacity: 1,
  background_opacity: 0,
  text_align: 'center',
  vertical_align: 'middle',
  line_height: 1.2,
  letter_spacing: 0,
  word_spacing: 0,
  text_transform: 'none',
  padding_top: 0,
  padding_right: 0,
  padding_bottom: 0,
  padding_left: 0,
  border_width: 0,
  border_color: '#000000',
  border_style: 'solid',
  border_radius: 0,
  rotation: 0,
  z_index: zIndex,
  locked: false,
  auto_shrink: false,
  clip_overflow: true,
});

export const normalizeCertificateElement = (element) => ({
  ...newCertificateElement(element.page_number || 1, element.z_index || 0),
  ...element,
  id: String(element.id || crypto.randomUUID()),
});

export const variableNamesFromElements = (elements) => {
  const names = new Set();
  elements.forEach((element) => {
    const content = String(element.content || '');
    for (const match of content.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi)) {
      names.add(match[1].toLowerCase());
    }
  });
  return [...names].sort();
};

export const mergeCertificateVariables = (variables, elements) => {
  const map = new Map((variables || []).map((variable) => [variable.name, {
    ...newCertificateVariable(variable.name),
    ...variable,
  }]));
  variableNamesFromElements(elements).forEach((name) => {
    if (!map.has(name)) map.set(name, newCertificateVariable(name));
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};

// Resolve {{tokens}}: provided value -> (preview) sample_value -> default_value -> blank.
// Never prints the humanized variable name, so a missing value can't leak onto the PDF.
export const fillCertificateVariables = (content, data, variables, { preview = false } = {}) => {
  const byName = new Map((variables || []).map((v) => [String(v.name).toLowerCase(), v]));
  return String(content || '').replace(
    /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi,
    (_, name) => {
      const key = name.toLowerCase();
      const provided = data?.[key];
      if (provided != null && provided !== '') return provided;
      const v = byName.get(key);
      if (preview && v?.sample_value) return v.sample_value;
      return v?.default_value ?? '';
    },
  );
};

// Ensure every declared variable is present (value -> default_value -> blank) before
// sending to the generator, so the PDF never renders a missing token.
export const buildCertificateData = (variables, data) => {
  const out = { ...(data || {}) };
  (variables || []).forEach((v) => {
    const key = String(v.name).toLowerCase();
    if (out[key] == null || out[key] === '') out[key] = v.default_value ?? '';
  });
  return out;
};

export const normalizeVariableName = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-z]/.test(normalized) ? normalized : `field_${normalized || 'value'}`;
};

// Full CSV parse -> { columns, rows: [{col: value}] } (handles quoted fields).
export const parseCsvRows = (text) => {
  const raw = [];
  let i = 0, field = '', row = [], inQ = false;
  const pushF = () => { row.push(field); field = ''; };
  const pushR = () => { raw.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else inQ = false; } else field += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') pushF();
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { pushF(); pushR(); }
    else field += ch;
    i += 1;
  }
  if (field.length || row.length) { pushF(); pushR(); }
  const clean = raw.filter((r) => r.some((c) => (c || '').trim() !== ''));
  if (!clean.length) return { columns: [], rows: [] };
  const columns = clean[0].map((h) => h.trim());
  const rows = clean.slice(1).map((r) => Object.fromEntries(columns.map((h, idx) => [h, (r[idx] || '').trim()])));
  return { columns, rows };
};

// Serialize rows back to CSV text for the batch generator (headers = column list).
export const toCsv = (columns, rows) => {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = columns.map(esc).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(',')).join('\n');
  return `${head}\n${body}\n`;
};

export const readCsvHeaders = async (file) => {
  const firstLine = (await file.text()).split(/\r?\n/, 1)[0] || '';
  return firstLine.split(',').map((value) => value.trim().replace(/^"|"$/g, '')).filter(Boolean);
};
