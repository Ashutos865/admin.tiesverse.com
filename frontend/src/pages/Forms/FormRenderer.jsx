import { useState, useEffect } from 'react';
import { Star, ArrowLeft, ArrowRight } from 'lucide-react';
import { mergeTheme, mergeSettings, fontStack, isStatic, pageCount, fieldPage } from './formConfig';

/**
 * Presentational renderer for a form. Drives the fill experience AND the
 * builder's live preview. Fully controlled: `values` + `onChange(id, value)`.
 * Supports multi-page forms with Back / Next navigation.
 *
 * Props:
 *   form           { title, description, schema, theme, settings }
 *   values         { [fieldId]: answer }
 *   onChange       (fieldId, value) => void
 *   onSubmit       () => void                         (omit in preview)
 *   onValidatePage (fieldIds) => bool                 (block Next on invalid)
 *   submitting, preview, errors
 */
export default function FormRenderer({
  form, values = {}, onChange, onSubmit, onValidatePage, submitting, preview, errors = {}, embedded,
}) {
  const theme = mergeTheme(form.theme);
  const settings = mergeSettings(form.settings);
  const accent = theme.accent || '#fe7a00';
  const textColor = theme.text_color || '#161616';   // headings/notes over the background
  const font = fontStack(theme.font);
  const total = pageCount(settings);
  const pages = settings.pages || [];

  const [page, setPage] = useState(0);
  useEffect(() => { if (page > total - 1) setPage(Math.max(0, total - 1)); }, [total, page]);

  // When `embedded`, the parent (FormFill) already paints the page background once,
  // so we stay transparent to avoid a second, mismatched background layer.
  const pageBg = embedded
    ? {}
    : theme.bg_type === 'image' && theme.bg_image
      ? { backgroundImage: `url(${theme.bg_image})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
      : theme.bg_type === 'gradient'
        ? { background: theme.bg_gradient }
        : { background: theme.bg_color };

  const cardStyle = theme.layout === 'plain'
    ? { background: 'transparent', boxShadow: 'none', border: 'none' }
    : { background: 'rgba(255,255,255,.92)', border: '1px solid rgba(0,0,0,.06)',
        boxShadow: '0 20px 60px -24px rgba(0,0,0,.35)', backdropFilter: 'blur(6px)' };

  const pageCfg = pages[page] || {};
  const isLast = page >= total - 1;

  // What shows in the heading card for this page.
  const headTitle = page === 0 ? (pageCfg.title || form.title || 'Untitled form') : (pageCfg.title || '');
  const headDesc = page === 0 ? (pageCfg.description || form.description || '') : (pageCfg.description || '');
  const banner = (total > 1 && pageCfg.banner) ? pageCfg.banner : theme.header_image;

  const pageFields = (form.schema || []).filter(f => fieldPage(f, total) === page);

  const goNext = () => {
    if (!preview && onValidatePage) {
      const ok = onValidatePage(pageFields.filter(f => !isStatic(f.type)).map(f => f.id));
      if (!ok) return;
    }
    setPage(p => Math.min(p + 1, total - 1));
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };
  const goBack = () => { setPage(p => Math.max(p - 1, 0)); window.scrollTo?.({ top: 0, behavior: 'smooth' }); };

  return (
    <div style={{ ...pageBg, minHeight: '100%', padding: '40px 16px', fontFamily: font }}>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {banner ? (
          <img src={banner} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 16 }} />
        ) : null}

        {total > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(0,0,0,.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((page + 1) / total) * 100}%`, background: accent, borderRadius: 999, transition: 'width .25s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}>Step {page + 1} / {total}</span>
          </div>
        )}

        {(headTitle || headDesc) ? (
          <div style={{ ...cardStyle, borderRadius: 20, padding: '28px 28px 22px', borderTop: `6px solid ${accent}` }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#161616', lineHeight: 1.2 }}>{headTitle}</h1>
            {headDesc ? (
              <p style={{ marginTop: 8, color: '#555', fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{headDesc}</p>
            ) : null}
          </div>
        ) : null}

        {pageFields.map((f) => (
          <FieldCard
            key={f.id}
            field={f}
            accent={accent}
            textColor={textColor}
            cardStyle={cardStyle}
            value={values[f.id]}
            onChange={(v) => onChange && onChange(f.id, v)}
            invalid={Boolean(errors[f.id])}
            preview={preview}
          />
        ))}

        {pageFields.length === 0 ? (
          <div style={{ ...cardStyle, borderRadius: 20, padding: 30, textAlign: 'center', color: '#888' }}>
            {total > 1 ? 'No questions on this page yet.' : 'No questions yet.'}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, gap: 10 }}>
          {page > 0 ? (
            <button type="button" onClick={goBack} disabled={submitting}
              style={{ ...navBtn, color: '#444', background: 'rgba(255,255,255,.85)', border: '1px solid rgba(0,0,0,.1)' }}>
              <ArrowLeft size={16} />Back
            </button>
          ) : <span />}

          {isLast ? (
            <button type="button" onClick={() => !preview && onSubmit && onSubmit()} disabled={preview || submitting}
              style={{ ...navBtn, background: accent, color: '#fff', boxShadow: `0 10px 24px -8px ${accent}`, opacity: submitting ? 0.7 : 1, cursor: preview ? 'default' : 'pointer' }}>
              {submitting ? 'Submitting…' : (theme.button_text || 'Submit')}
            </button>
          ) : (
            <button type="button" onClick={goNext}
              style={{ ...navBtn, background: accent, color: '#fff', boxShadow: `0 10px 24px -8px ${accent}` }}>
              {pageCfg.next_text || 'Next'}<ArrowRight size={16} />
            </button>
          )}
        </div>

        <TiesFooter show={settings.show_footer !== false} />
      </div>
    </div>
  );
}

// Branded footer strip — reads on any background.
export function TiesFooter({ show = true }) {
  if (!show) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
      <span style={{ background: 'rgba(255,255,255,.9)', border: '1px solid rgba(0,0,0,.06)', borderRadius: 999, padding: '6px 15px', fontSize: 12.5, color: '#555', boxShadow: '0 6px 18px -10px rgba(0,0,0,.3)', backdropFilter: 'blur(4px)' }}>
        Made with <span style={{ color: '#e0245e' }}>❤</span> by Tech&nbsp;·&nbsp;<strong style={{ color: '#161616', fontWeight: 800 }}>Tiesverse</strong>
      </span>
    </div>
  );
}

const navBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 12,
  padding: '12px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
};

function FieldCard({ field, accent, textColor = '#161616', cardStyle, value, onChange, invalid, preview }) {
  if (field.type === 'heading') {
    return (
      <div style={{ padding: '10px 4px 2px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: textColor, margin: 0 }}>{field.label}</h2>
        {field.help ? <p style={{ color: textColor, opacity: 0.72, fontSize: 14, marginTop: 4 }}>{field.help}</p> : null}
      </div>
    );
  }
  if (field.type === 'paragraph') {
    return (
      <div style={{ padding: '2px 4px' }}>
        <p style={{ color: textColor, opacity: 0.85, fontSize: 15, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{field.label}</p>
      </div>
    );
  }

  return (
    <div id={`fill-${field.id}`} style={{ ...cardStyle, borderRadius: 16, padding: '18px 20px',
      outline: invalid ? '2px solid #ef4444' : 'none' }}>
      <label style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#222', marginBottom: field.help ? 2 : 10 }}>
        {field.label || 'Untitled question'}
        {field.required ? <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span> : null}
      </label>
      {field.help ? <div style={{ fontSize: 13, color: '#777', marginBottom: 10 }}>{field.help}</div> : null}
      <FieldControl field={field} accent={accent} value={value} onChange={onChange} disabled={preview} />
    </div>
  );
}

const inputBase = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  border: '1px solid #d7d9de', borderRadius: 10, fontSize: 15,
  background: '#fff', color: '#161616', outline: 'none', fontFamily: 'inherit',
};

function FieldControl({ field, accent, value, onChange, disabled }) {
  const set = (v) => !disabled && onChange(v);

  switch (field.type) {
    case 'long_text':
      return <textarea style={{ ...inputBase, minHeight: 110, resize: 'vertical', lineHeight: 1.5 }}
        value={value || ''} placeholder={field.placeholder || ''} onChange={e => set(e.target.value)} />;

    case 'multiple_choice':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {(field.options || []).map((opt, i) => (
            <OptionCard key={i} label={opt} accent={accent} selected={value === opt} type="radio" onClick={() => set(opt)} />
          ))}
        </div>
      );

    case 'checkboxes': {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (opt) => arr.includes(opt) ? set(arr.filter(o => o !== opt)) : set([...arr, opt]);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {(field.options || []).map((opt, i) => (
            <OptionCard key={i} label={opt} accent={accent} selected={arr.includes(opt)} type="check" onClick={() => toggle(opt)} />
          ))}
        </div>
      );
    }

    case 'dropdown':
      return (
        <select style={inputBase} value={value || ''} onChange={e => set(e.target.value)}>
          <option value="">Choose…</option>
          {(field.options || []).map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
        </select>
      );

    case 'number':
      return <input type="number" style={inputBase} value={value ?? ''} placeholder={field.placeholder || ''} onChange={e => set(e.target.value)} />;
    case 'email':
      return <input type="email" style={inputBase} value={value || ''} placeholder={field.placeholder || 'name@example.com'} onChange={e => set(e.target.value)} />;
    case 'phone':
      return <input type="tel" style={inputBase} value={value || ''} placeholder={field.placeholder || ''} onChange={e => set(e.target.value)} />;
    case 'url':
      return <input type="url" style={inputBase} value={value || ''} placeholder={field.placeholder || 'https://'} onChange={e => set(e.target.value)} />;
    case 'date':
      return <input type="date" style={inputBase} value={value || ''} onChange={e => set(e.target.value)} />;
    case 'time':
      return <input type="time" style={inputBase} value={value || ''} onChange={e => set(e.target.value)} />;

    case 'rating': {
      const scale = field.scale || 5;
      const cur = Number(value) || 0;
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: scale }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" onClick={() => set(n)}
              style={{ border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer', padding: 2 }}>
              <Star size={30} fill={n <= cur ? accent : 'none'} color={n <= cur ? accent : '#c7cad0'} />
            </button>
          ))}
        </div>
      );
    }

    case 'file':
      return (
        <input type="file" style={{ ...inputBase, padding: 8 }}
          onChange={e => set(e.target.files?.[0]?.name || '')} />
      );

    case 'short_text':
    default:
      return <input type="text" style={inputBase} value={value || ''} placeholder={field.placeholder || ''} onChange={e => set(e.target.value)} />;
  }
}

// A modern, tappable option "card" that highlights with the form's accent.
function OptionCard({ label, accent, selected, type, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
      padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 15, lineHeight: 1.35,
      background: selected ? `${accent}12` : '#fff',
      border: `1.5px solid ${selected ? accent : '#e2e4ea'}`,
      color: '#222', transition: 'background .15s, border-color .15s',
    }}>
      <span style={{
        width: 20, height: 20, flexShrink: 0, display: 'grid', placeItems: 'center',
        borderRadius: type === 'radio' ? '50%' : 6,
        border: `2px solid ${selected ? accent : '#c7cad0'}`,
        background: selected ? accent : '#fff',
      }}>
        {selected && (type === 'radio'
          ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
          : <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>)}
      </span>
      <span>{label}</span>
    </button>
  );
}

export { isStatic };
