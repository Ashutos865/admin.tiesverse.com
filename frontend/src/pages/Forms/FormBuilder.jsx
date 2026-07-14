import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Eye, EyeOff, Save, GripVertical, Copy, Trash2, Plus, X,
  Palette, Settings2, Globe, Lock, Link2, Check, Image as ImageIcon, Loader2,
  Layers, ChevronDown,
} from 'lucide-react';
import { getForm, updateForm, uploadImage, getFormSenders } from '../../apiClient';
import {
  FIELD_TYPES, FIELD_META, newField, newPage, hasOptions, isStatic,
  mergeTheme, mergeSettings, FONT_OPTIONS, pageCount, fieldPage, PUBLIC_FORMS_ORIGIN,
} from './formConfig';
import FormRenderer from './FormRenderer';
import { useMe } from '../../context/MeContext';

const GRADIENTS = [
  'linear-gradient(135deg,#fff7ed,#ffedd5)',
  'linear-gradient(135deg,#eef2ff,#e0e7ff)',
  'linear-gradient(135deg,#ecfeff,#cffafe)',
  'linear-gradient(135deg,#f0fdf4,#dcfce7)',
  'linear-gradient(135deg,#fdf2f8,#fce7f3)',
  'linear-gradient(160deg,#1e293b,#0f172a)',
];

export default function FormBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { scope } = useMe();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [tab, setTab] = useState('design');   // 'design' | 'pages' | 'settings'
  const [activeField, setActiveField] = useState(null);
  const [activePage, setActivePage] = useState(0);
  const [copied, setCopied] = useState(false);
  const dragIndex = useRef(null);

  useEffect(() => {
    (async () => {
      const res = await getForm(id).catch(() => ({ error: 'Failed' }));
      if (res?.id) {
        setForm({ ...res, theme: mergeTheme(res.theme), settings: mergeSettings(res.settings), schema: res.schema || [] });
      } else {
        alert(res?.error || 'Form not found.');
        navigate('/hr/forms');
      }
      setLoading(false);
    })();
  }, [id, navigate]);

  const patch = useCallback((changes) => {
    setForm(f => ({ ...f, ...changes }));
    setDirty(true);
  }, []);
  const patchTheme = (changes) => patch({ theme: { ...form.theme, ...changes } });
  const patchSettings = (changes) => patch({ settings: { ...form.settings, ...changes } });

  const multiPage = form?.settings?.multi_page;
  const total = form ? pageCount(form.settings) : 1;
  const pages = form?.settings?.pages || [];

  // ---- field ops --------------------------------------------------------
  const addField = (type) => {
    const nf = { ...newField(type), page: multiPage ? Math.min(activePage, total - 1) : 0 };
    patch({ schema: [...form.schema, nf] });
    setActiveField(nf.id);
    setTimeout(() => document.getElementById(`fld-${nf.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
  };
  const updateField = (fid, changes) =>
    patch({ schema: form.schema.map(f => f.id === fid ? { ...f, ...changes } : f) });
  const duplicateField = (fid) => {
    const idx = form.schema.findIndex(f => f.id === fid);
    if (idx < 0) return;
    const src = form.schema[idx];
    const clone = { ...newField(src.type), label: src.label, options: src.options, help: src.help, required: src.required, scale: src.scale, page: src.page || 0 };
    const next = [...form.schema];
    next.splice(idx + 1, 0, clone);
    patch({ schema: next });
  };
  const deleteField = (fid) =>
    patch({ schema: form.schema.filter(f => f.id !== fid) });

  const onDrop = (targetIdx) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIdx) return;
    const next = [...form.schema];
    const [moved] = next.splice(from, 1);
    next.splice(targetIdx, 0, moved);
    patch({ schema: next });
  };

  // ---- page ops ---------------------------------------------------------
  const setMultiPage = (on) => {
    if (on) {
      const seeded = pages.length >= 2 ? pages : [newPage(), newPage()];
      patchSettings({ multi_page: true, pages: seeded });
    } else {
      patchSettings({ multi_page: false });
      setActivePage(0);
    }
  };
  const addPage = () => patchSettings({ pages: [...pages, newPage()] });
  const updatePage = (idx, changes) =>
    patchSettings({ pages: pages.map((p, i) => i === idx ? { ...p, ...changes } : p) });
  const removePage = (idx) => {
    if (pages.length <= 1) return;
    const nextPages = pages.filter((_, i) => i !== idx);
    const nextSchema = form.schema.map(f => {
      const p = fieldPage(f, total);
      if (p === idx) return { ...f, page: Math.max(0, idx - 1) };
      if (p > idx) return { ...f, page: p - 1 };
      return f;
    });
    patch({ settings: { ...form.settings, pages: nextPages }, schema: nextSchema });
    setActivePage(a => Math.min(a, nextPages.length - 1));
  };

  // ---- save / publish ---------------------------------------------------
  const save = async (extra = {}) => {
    setSaving(true);
    const payload = {
      title: form.title, description: form.description, schema: form.schema,
      theme: form.theme, settings: form.settings, visibility: form.visibility,
      is_published: form.is_published, ...extra,
    };
    const res = await updateForm(id, payload).catch(() => ({ error: 'Failed' }));
    setSaving(false);
    if (res?.id) { setForm(f => ({ ...f, ...res, theme: mergeTheme(res.theme), settings: mergeSettings(res.settings) })); setDirty(false); return true; }
    alert(res?.error || 'Could not save.');
    return false;
  };
  const togglePublish = async () => {
    const next = !form.is_published;
    patch({ is_published: next });
    await save({ is_published: next });
  };

  const shareLink = form && (form.visibility === 'public'
    ? `${PUBLIC_FORMS_ORIGIN}/f/${form.token}`
    : `${window.location.origin}/forms/${form.id}`);
  const copyLink = () => { navigator.clipboard?.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  if (scope !== 'all') return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Only HR &amp; Advisory can build forms.</div>;
  if (loading || !form) return <div style={{ padding: 40, color: '#9ca3af' }}>Loading…</div>;

  // Fields tagged with their true schema index (for drag + grouping).
  const indexed = form.schema.map((f, idx) => ({ f, idx }));
  const fieldsOnPage = (p) => indexed.filter(x => fieldPage(x.f, total) === p);

  const renderFieldCard = ({ f, idx }) => (
    <FieldEditor
      key={f.id}
      field={f}
      active={activeField === f.id}
      multiPage={multiPage}
      total={total}
      onActivate={() => setActiveField(f.id)}
      onChange={(c) => updateField(f.id, c)}
      onDuplicate={() => duplicateField(f.id)}
      onDelete={() => deleteField(f.id)}
      onDragStart={() => { dragIndex.current = idx; }}
      onDropHere={() => onDrop(idx)}
    />
  );

  return (
    <div style={S.page}>
      {/* Top bar */}
      <div style={S.topbar}>
        <button style={S.iconBtn} onClick={() => (dirty ? window.confirm('Discard unsaved changes?') : true) && navigate('/hr/forms')}>
          <ArrowLeft size={18} />
        </button>
        <input style={S.titleInput} value={form.title} onChange={e => patch({ title: e.target.value })} placeholder="Form title" />
        <div style={{ flex: 1 }} />
        {dirty && <span style={S.dirty}>Unsaved</span>}
        <button style={S.ghostBtn} onClick={() => setPreview(p => !p)}>
          {preview ? <><EyeOff size={15} />Edit</> : <><Eye size={15} />Preview</>}
        </button>
        <label style={{ ...S.publishToggle, background: form.is_published ? '#10b981' : 'var(--surface-hover,#e5e7eb)', color: form.is_published ? '#fff' : 'var(--text-muted,#6b7280)' }} onClick={togglePublish}>
          {form.is_published ? 'Published' : 'Draft'}
        </label>
        <button style={S.saveBtn} disabled={saving} onClick={() => save()}>
          {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}Save
        </button>
      </div>

      {preview ? (
        <div style={S.previewWrap}>
          <FormRenderer form={form} values={{}} onChange={() => {}} preview />
        </div>
      ) : (
        <div style={S.body}>
          {/* Left palette */}
          <div style={S.palette}>
            <div style={S.paletteLabel}>
              Add field{multiPage ? <span style={{ color: '#fe7a00' }}> → Page {activePage + 1}</span> : ''}
            </div>
            {FIELD_TYPES.map(ft => {
              const Icon = ft.icon;
              return (
                <button key={ft.type} style={S.palItem} onClick={() => addField(ft.type)}>
                  <Icon size={16} style={{ color: '#fe7a00', flex: 'none' }} />{ft.label}
                </button>
              );
            })}
          </div>

          {/* Center canvas */}
          <div style={S.canvas}>
            <div style={S.formHeaderCard}>
              <input style={S.canvasTitle} value={form.title} onChange={e => patch({ title: e.target.value })} placeholder="Form title" />
              <textarea style={S.canvasDesc} value={form.description} onChange={e => patch({ description: e.target.value })} placeholder="Form description (optional)" rows={2} />
            </div>

            {!multiPage && (
              <>
                {form.schema.length === 0 && <div style={S.emptyCanvas}>Add fields from the left to start building.</div>}
                {indexed.map(renderFieldCard)}
              </>
            )}

            {multiPage && Array.from({ length: total }, (_, p) => {
              const pageFields = fieldsOnPage(p);
              const cfg = pages[p] || {};
              const on = activePage === p;
              return (
                <div key={p} style={{ ...S.pageGroup, ...(on ? S.pageGroupOn : {}) }} onClick={() => setActivePage(p)}>
                  <div style={S.pageBar}>
                    <span style={{ ...S.pageChip, ...(on ? S.pageChipOn : {}) }}><Layers size={12} />Page {p + 1}</span>
                    <input
                      style={S.pageTitleInput}
                      value={cfg.title || ''}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updatePage(p, { title: e.target.value })}
                      placeholder={p === 0 ? 'Page heading (defaults to form title)' : 'Page heading (optional)'}
                    />
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted,#9ca3af)', whiteSpace: 'nowrap' }}>{pageFields.length} field{pageFields.length === 1 ? '' : 's'}</span>
                    {total > 1 && (
                      <button style={S.pageDel} title="Delete page" onClick={e => { e.stopPropagation(); removePage(p); }}><Trash2 size={14} /></button>
                    )}
                  </div>
                  {pageFields.length === 0
                    ? <div style={S.pageEmpty}>No fields on this page. Select it and add fields from the left.</div>
                    : pageFields.map(renderFieldCard)}
                </div>
              );
            })}

            {multiPage && (
              <button style={S.addPageBtn} onClick={addPage}><Plus size={15} />Add page</button>
            )}
          </div>

          {/* Right inspector */}
          <div style={S.inspector}>
            <div style={S.tabs}>
              <button style={{ ...S.tab, ...(tab === 'design' ? S.tabOn : {}) }} onClick={() => setTab('design')}><Palette size={14} />Design</button>
              <button style={{ ...S.tab, ...(tab === 'pages' ? S.tabOn : {}) }} onClick={() => setTab('pages')}><Layers size={14} />Pages</button>
              <button style={{ ...S.tab, ...(tab === 'settings' ? S.tabOn : {}) }} onClick={() => setTab('settings')}><Settings2 size={14} />Settings</button>
            </div>

            {tab === 'design' && <DesignPanel theme={form.theme} onChange={patchTheme} />}
            {tab === 'pages' && (
              <PagesPanel
                multiPage={multiPage} pages={pages} activePage={activePage}
                onToggle={setMultiPage} onAdd={addPage} onUpdate={updatePage} onRemove={removePage}
                onFocus={setActivePage} globalBanner={form.theme.header_image}
              />
            )}
            {tab === 'settings' && (
              <SettingsPanel form={form} onChange={patch} onSettings={patchSettings} shareLink={shareLink} copied={copied} copyLink={copyLink} />
            )}
          </div>
        </div>
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Field editor card                                                   */
/* ------------------------------------------------------------------ */
function FieldEditor({ field, active, multiPage, total, onActivate, onChange, onDuplicate, onDelete, onDragStart, onDropHere }) {
  const meta = FIELD_META[field.type] || {};
  const Icon = meta.icon;
  const staticField = isStatic(field.type);

  return (
    <div
      id={`fld-${field.id}`}
      style={{ ...FS.card, ...(active ? FS.cardActive : {}) }}
      onClick={onActivate}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropHere}
    >
      <div style={FS.cardHead}>
        <span draggable onDragStart={onDragStart} style={FS.grip} title="Drag to reorder"><GripVertical size={16} /></span>
        <span style={FS.typeTag}>{Icon ? <Icon size={13} /> : null}{meta.label || field.type}</span>
        <div style={{ flex: 1 }} />
        {multiPage && total > 1 && (
          <select style={FS.pageSel} value={fieldPage(field, total)} onClick={e => e.stopPropagation()} onChange={e => onChange({ page: Number(e.target.value) })} title="Move to page">
            {Array.from({ length: total }, (_, i) => <option key={i} value={i}>P{i + 1}</option>)}
          </select>
        )}
        <button style={FS.miniBtn} title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}><Copy size={14} /></button>
        <button style={{ ...FS.miniBtn, color: '#ef4444' }} title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={14} /></button>
      </div>

      <input
        style={FS.qInput}
        value={field.label}
        onChange={e => onChange({ label: e.target.value })}
        placeholder={staticField ? (field.type === 'heading' ? 'Section title' : 'Text block content') : 'Question'}
      />

      {!staticField && (
        <input style={FS.help} value={field.help || ''} onChange={e => onChange({ help: e.target.value })} placeholder="Help text (optional)" />
      )}

      {hasOptions(field.type) && <OptionsEditor field={field} onChange={onChange} />}

      {field.type === 'rating' && (
        <label style={FS.inlineLbl}>Stars
          <select style={FS.scaleSel} value={field.scale || 5} onChange={e => onChange({ scale: Number(e.target.value) })}>
            {[3, 4, 5, 7, 10].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}

      {!staticField && (
        <div style={FS.footRow}>
          <label style={FS.reqToggle}>
            <input type="checkbox" checked={!!field.required} onChange={e => onChange({ required: e.target.checked })} />
            Required
          </label>
        </div>
      )}
    </div>
  );
}

function OptionsEditor({ field, onChange }) {
  const opts = field.options || [];
  const set = (i, v) => onChange({ options: opts.map((o, j) => j === i ? v : o) });
  const add = () => onChange({ options: [...opts, `Option ${opts.length + 1}`] });
  const del = (i) => onChange({ options: opts.filter((_, j) => j !== i) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {opts.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#c7cad0', fontSize: 12 }}>{field.type === 'checkboxes' ? '☐' : '○'}</span>
          <input style={FS.optInput} value={o} onChange={e => set(i, e.target.value)} />
          <button style={FS.miniBtn} onClick={() => del(i)}><X size={14} /></button>
        </div>
      ))}
      <button style={FS.addOpt} onClick={add}><Plus size={13} />Add option</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pages panel                                                         */
/* ------------------------------------------------------------------ */
function PagesPanel({ multiPage, pages, activePage, onToggle, onAdd, onUpdate, onRemove, onFocus, globalBanner }) {
  const [busy, setBusy] = useState(null);
  const uploadBanner = async (idx) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(idx);
      const res = await uploadImage(file).catch(() => ({ error: 'Failed' }));
      setBusy(null);
      const url = res?.url || res?.secure_url || res?.location;
      if (url) onUpdate(idx, { banner: url });
      else alert(res?.error || 'Upload failed.');
    };
    input.click();
  };

  return (
    <div style={P.wrap}>
      <div style={P.toggleRow}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main,#374151)' }}>Multi-page form</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted,#9ca3af)' }}>Split questions across steps with Next / Back.</div>
        </div>
        <span onClick={() => onToggle(!multiPage)} style={{ ...P.switch, background: multiPage ? '#fe7a00' : 'var(--surface-hover,#d1d5db)' }}>
          <span style={{ ...P.knob, transform: multiPage ? 'translateX(16px)' : 'none' }} />
        </span>
      </div>

      {!multiPage ? (
        <div style={P.pagesHint}>Turn this on to break the form into multiple pages. You can then assign each question to a page and set the banner, heading &amp; button text per page.</div>
      ) : (
        <>
          {pages.map((pg, i) => {
            const on = activePage === i;
            return (
              <div key={pg.id || i} style={{ ...P.pageCard, ...(on ? P.pageCardOn : {}) }} onClick={() => onFocus(i)}>
                <div style={P.pageCardHead}>
                  <span style={{ ...P.pageChip, ...(on ? P.pageChipOn : {}) }}><Layers size={12} />Page {i + 1}</span>
                  <div style={{ flex: 1 }} />
                  {pages.length > 1 && <button style={P.pageDel} onClick={e => { e.stopPropagation(); onRemove(i); }}><Trash2 size={13} /></button>}
                </div>
                <input style={P.pageField} value={pg.title || ''} onChange={e => onUpdate(i, { title: e.target.value })} placeholder={i === 0 ? 'Heading (defaults to form title)' : 'Heading (optional)'} />
                <textarea style={{ ...P.pageField, minHeight: 46, resize: 'vertical' }} value={pg.description || ''} onChange={e => onUpdate(i, { description: e.target.value })} placeholder="Subheading / description (optional)" />

                <div style={P.bannerLabel}>Banner</div>
                {pg.banner ? (
                  <div style={{ position: 'relative' }}>
                    <img src={pg.banner} alt="" style={{ width: '100%', height: 58, objectFit: 'cover', borderRadius: 8 }} />
                    <button style={P.removeImg} onClick={e => { e.stopPropagation(); onUpdate(i, { banner: '' }); }}><X size={12} /></button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted,#9ca3af)', marginBottom: 4 }}>
                    {globalBanner ? 'Using the global header image.' : 'No banner (inherits global header).'}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button style={P.smallBtn} onClick={e => { e.stopPropagation(); uploadBanner(i); }}>
                    {busy === i ? <Loader2 size={12} className="spin" /> : <ImageIcon size={12} />}Upload
                  </button>
                </div>
                <input style={{ ...P.pageField, marginTop: 6, fontSize: 12 }} value={pg.banner || ''} onClick={e => e.stopPropagation()} onChange={e => onUpdate(i, { banner: e.target.value })} placeholder="…or paste an external image URL" />

                {i < pages.length - 1 && (
                  <>
                    <div style={P.bannerLabel}>Next button text</div>
                    <input style={P.pageField} value={pg.next_text || ''} onChange={e => onUpdate(i, { next_text: e.target.value })} placeholder="Next" />
                  </>
                )}
              </div>
            );
          })}
          <button style={P.addPageInspector} onClick={onAdd}><Plus size={14} />Add page</button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Design (theme) panel                                                */
/* ------------------------------------------------------------------ */
function DesignPanel({ theme, onChange }) {
  const [busy, setBusy] = useState('');
  const upload = async (kind) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(kind);
      const res = await uploadImage(file).catch(() => ({ error: 'Failed' }));
      setBusy('');
      const url = res?.url || res?.secure_url || res?.location;
      if (url) onChange(kind === 'bg' ? { bg_type: 'image', bg_image: url } : { header_image: url });
      else alert(res?.error || 'Upload failed.');
    };
    input.click();
  };

  return (
    <div style={P.wrap}>
      <div style={P.group}>Background</div>
      <div style={P.segRow}>
        {['color', 'gradient', 'image'].map(t => (
          <button key={t} style={{ ...P.seg, ...(theme.bg_type === t ? P.segOn : {}) }} onClick={() => onChange({ bg_type: t })}>{t}</button>
        ))}
      </div>

      {theme.bg_type === 'color' && (
        <label style={P.row}>Colour
          <input type="color" style={P.color} value={theme.bg_color} onChange={e => onChange({ bg_color: e.target.value })} />
        </label>
      )}
      {theme.bg_type === 'gradient' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 8 }}>
          {GRADIENTS.map(g => (
            <button key={g} onClick={() => onChange({ bg_gradient: g })}
              style={{ height: 44, borderRadius: 10, border: theme.bg_gradient === g ? '2px solid #fe7a00' : '1px solid var(--border,#e5e7eb)', background: g, cursor: 'pointer' }} />
          ))}
        </div>
      )}
      {theme.bg_type === 'image' && (
        <div style={{ marginTop: 8 }}>
          <button style={P.uploadBtn} onClick={() => upload('bg')}>
            {busy === 'bg' ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
            {theme.bg_image ? 'Change image' : 'Upload background'}
          </button>
          {theme.bg_image && <img src={theme.bg_image} alt="" style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 8, marginTop: 8 }} />}
        </div>
      )}

      <div style={P.group}>Accent colour</div>
      <label style={P.row}>Buttons &amp; highlights
        <input type="color" style={P.color} value={theme.accent} onChange={e => onChange({ accent: e.target.value })} />
      </label>

      <div style={P.group}>Global header image</div>
      <button style={P.uploadBtn} onClick={() => upload('header')}>
        {busy === 'header' ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
        {theme.header_image ? 'Change header' : 'Upload header'}
      </button>
      {theme.header_image && (
        <div style={{ position: 'relative', marginTop: 8 }}>
          <img src={theme.header_image} alt="" style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 8 }} />
          <button style={P.removeImg} onClick={() => onChange({ header_image: '' })}><X size={13} /></button>
        </div>
      )}
      <input style={{ ...P.select, marginTop: 6, fontSize: 12 }} value={theme.header_image || ''} onChange={e => onChange({ header_image: e.target.value })} placeholder="…or paste an external image URL" />

      <div style={P.group}>Font</div>
      <select style={P.select} value={theme.font} onChange={e => onChange({ font: e.target.value })}>
        {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>

      <div style={P.group}>Layout</div>
      <div style={P.segRow}>
        {['card', 'plain'].map(l => (
          <button key={l} style={{ ...P.seg, ...(theme.layout === l ? P.segOn : {}) }} onClick={() => onChange({ layout: l })}>{l}</button>
        ))}
      </div>

      <div style={P.group}>Submit button text</div>
      <input style={P.select} value={theme.button_text} onChange={e => onChange({ button_text: e.target.value })} placeholder="Submit" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings panel                                                      */
/* ------------------------------------------------------------------ */
function SettingsPanel({ form, onChange, onSettings, shareLink, copied, copyLink }) {
  const s = form.settings;
  const [senders, setSenders] = useState({ emails: [], domains: [], default: '' });
  useEffect(() => { getFormSenders().then(r => setSenders(r || {})); }, []);
  return (
    <div style={P.wrap}>
      <div style={P.group}>Who can access</div>
      {[
        { v: 'internal', icon: Lock, label: 'Internal', desc: 'Only logged-in members can open & fill.' },
        { v: 'public', icon: Globe, label: 'Public link', desc: 'Anyone with the link can fill (no login).' },
      ].map(o => {
        const Icon = o.icon;
        const on = form.visibility === o.v;
        return (
          <button key={o.v} style={{ ...P.visCard, ...(on ? P.visOn : {}) }} onClick={() => onChange({ visibility: o.v })}>
            <Icon size={16} style={{ color: on ? '#fe7a00' : '#9ca3af', flex: 'none', marginTop: 1 }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-main,#111827)' }}>{o.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted,#6b7280)' }}>{o.desc}</div>
            </div>
          </button>
        );
      })}

      <div style={P.group}>Share link</div>
      <div style={P.shareBox}>
        <input readOnly value={shareLink} style={P.shareInput} onFocus={e => e.target.select()} />
        <button style={P.copyBtn} onClick={copyLink}>{copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}</button>
      </div>
      {!form.is_published && <div style={P.hint}>Publish the form for this link to work.</div>}

      <div style={P.group}>Response options</div>
      <Toggle label="Anonymous responses" checked={!!s.anonymous} onChange={v => onSettings({ anonymous: v })} hint="For reviews & feedback — the public form won't ask for the person's name or email." />
      <Toggle label="Accepting responses" checked={s.accepting !== false} onChange={v => onSettings({ accepting: v })} />
      <Toggle label="Require login to submit" checked={!!s.require_login} onChange={v => onSettings({ require_login: v })} />
      <Toggle label="One response per person" checked={!!s.one_response} onChange={v => onSettings({ one_response: v })} hint="Only enforceable for logged-in members." />
      <Toggle label="Email a confirmation receipt" checked={s.send_confirmation !== false} onChange={v => onSettings({ send_confirmation: v })} hint="Sent to the email the person provides (or their account email)." />

      {s.send_confirmation !== false && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4, borderLeft: '2px solid #fe7a0033', marginTop: 2 }}>
          <div style={{ ...P.group, marginTop: 6 }}>Send from (alias)</div>
          <input
            list="ses-senders"
            style={P.select}
            value={s.from_email || ''}
            onChange={e => onSettings({ from_email: e.target.value })}
            placeholder={senders.default ? `Default — ${senders.default}` : 'System default'}
          />
          <datalist id="ses-senders">
            {(senders.emails || []).map(em => <option key={em} value={em} />)}
          </datalist>
          <input
            style={P.select}
            value={s.from_name || ''}
            onChange={e => onSettings({ from_name: e.target.value })}
            placeholder="Sender name (optional) — e.g. TIES Team"
          />
          <div style={P.senderHint}>
            Leave blank to use {senders.default || 'the default sender'}.
            {(senders.domains || []).length ? ` Any address @${(senders.domains || []).join(', @')} works.` : ''}
          </div>
        </div>
      )}

      <div style={P.group}>Close date (optional)</div>
      <input type="date" style={P.select} value={s.close_date || ''} onChange={e => onSettings({ close_date: e.target.value })} />

      <div style={P.group}>After-submit screen</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...P.select, width: 64, textAlign: 'center', fontSize: 20 }} value={s.thank_you_emoji ?? '🎉'} onChange={e => onSettings({ thank_you_emoji: e.target.value })} placeholder="🎉" />
        <input style={{ ...P.select, flex: 1 }} value={s.thank_you_title ?? 'All done!'} onChange={e => onSettings({ thank_you_title: e.target.value })} placeholder="Heading (e.g. All done!)" />
      </div>
      <textarea style={{ ...P.select, minHeight: 70, resize: 'vertical', marginTop: 8 }} value={s.thank_you} onChange={e => onSettings({ thank_you: e.target.value })} placeholder="Message shown after a successful submit" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input style={{ ...P.select, flex: 1 }} value={s.thank_you_button_text || ''} onChange={e => onSettings({ thank_you_button_text: e.target.value })} placeholder="Button text (optional)" />
        <input style={{ ...P.select, flex: 2 }} value={s.thank_you_button_url || ''} onChange={e => onSettings({ thank_you_button_url: e.target.value })} placeholder="Button link https://…" />
      </div>

      <div style={{ marginTop: 12 }}>
        <Toggle label={'Show “Made with ❤ with Tech · Tiesverse” footer'} checked={s.show_footer !== false} onChange={v => onSettings({ show_footer: v })} />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label style={P.toggleRow}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main,#374151)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted,#9ca3af)' }}>{hint}</div>}
      </div>
      <span onClick={() => onChange(!checked)} style={{ ...P.switch, background: checked ? '#fe7a00' : 'var(--surface-hover,#d1d5db)' }}>
        <span style={{ ...P.knob, transform: checked ? 'translateX(16px)' : 'none' }} />
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  topbar: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border,#e5e7eb)', background: 'var(--surface,#fff)', position: 'sticky', top: 0, zIndex: 20 },
  iconBtn: { border: '1px solid var(--border,#e5e7eb)', background: 'transparent', borderRadius: 9, padding: 7, cursor: 'pointer', color: 'var(--text-main,#374151)', display: 'inline-flex' },
  titleInput: { border: 'none', background: 'transparent', fontSize: 17, fontWeight: 700, color: 'var(--text-main,#111827)', outline: 'none', minWidth: 120, maxWidth: 360 },
  dirty: { fontSize: 12, color: '#b45309', fontWeight: 600 },
  ghostBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border,#e5e7eb)', background: 'transparent', borderRadius: 9, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-main,#374151)' },
  publishToggle: { borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', userSelect: 'none' },
  saveBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'linear-gradient(180deg,#ff9a3d,#fe7a00 58%,#ef6f00)', color: '#fff', borderRadius: 9, padding: '8px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  body: { display: 'grid', gridTemplateColumns: '210px 1fr 310px', gap: 0, flex: 1, minHeight: 0, overflow: 'hidden' },
  palette: { borderRight: '1px solid var(--border,#e5e7eb)', padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface,#fff)' },
  paletteLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted,#9ca3af)', margin: '2px 4px 8px' },
  palItem: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', border: '1px solid transparent', borderRadius: 9, background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-main,#374151)', textAlign: 'left' },
  canvas: { overflowY: 'auto', padding: '24px 20px 80px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--canvas,#f6f7f9)' },
  formHeaderCard: { background: 'var(--surface,#fff)', borderRadius: 14, borderTop: '6px solid #fe7a00', border: '1px solid var(--border,#e5e7eb)', padding: 20, maxWidth: 640, width: '100%', margin: '0 auto' },
  canvasTitle: { border: 'none', borderBottom: '1px solid transparent', background: 'transparent', fontSize: 22, fontWeight: 800, color: 'var(--text-main,#111827)', outline: 'none', width: '100%', marginBottom: 6 },
  canvasDesc: { border: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-muted,#6b7280)', outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit' },
  emptyCanvas: { maxWidth: 640, width: '100%', margin: '0 auto', textAlign: 'center', color: 'var(--text-muted,#9ca3af)', padding: 40, border: '2px dashed var(--border,#e5e7eb)', borderRadius: 14 },
  pageGroup: { maxWidth: 660, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 12, border: '1px dashed var(--border,#dfe3e8)', borderRadius: 16, background: 'transparent' },
  pageGroupOn: { borderColor: '#fe7a00', background: '#fe7a0008' },
  pageBar: { display: 'flex', alignItems: 'center', gap: 10 },
  pageChip: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: 'var(--text-muted,#6b7280)', background: 'var(--surface-hover,#eceef1)', padding: '4px 10px', borderRadius: 999, flex: 'none' },
  pageChipOn: { color: '#fff', background: '#fe7a00' },
  pageTitleInput: { flex: 1, minWidth: 0, border: 'none', borderBottom: '1px solid transparent', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--text-main,#374151)', outline: 'none', padding: '4px 2px' },
  pageDel: { border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'inline-flex', flex: 'none' },
  pageEmpty: { textAlign: 'center', color: 'var(--text-muted,#9ca3af)', fontSize: 13, padding: 20, border: '2px dashed var(--border,#e5e7eb)', borderRadius: 12 },
  addPageBtn: { maxWidth: 660, width: '100%', margin: '0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '2px dashed var(--border,#cbd0d8)', background: 'transparent', borderRadius: 14, padding: '14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: 'var(--text-main,#374151)' },
  inspector: { borderLeft: '1px solid var(--border,#e5e7eb)', overflowY: 'auto', background: 'var(--surface,#fff)' },
  tabs: { display: 'flex', gap: 2, padding: 8, borderBottom: '1px solid var(--border,#e5e7eb)', position: 'sticky', top: 0, background: 'var(--surface,#fff)', zIndex: 2 },
  tab: { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, border: 'none', background: 'transparent', padding: '8px 4px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--text-muted,#6b7280)' },
  tabOn: { background: '#fe7a0014', color: '#c2410c' },
  previewWrap: { flex: 1, overflowY: 'auto', minHeight: 0 },
};

const FS = {
  card: { background: 'var(--surface,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 14, padding: 16, maxWidth: 640, width: '100%', margin: '0 auto', cursor: 'pointer' },
  cardActive: { borderColor: '#fe7a00', boxShadow: '0 0 0 3px #fe7a0018' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  grip: { cursor: 'grab', color: '#c7cad0', display: 'inline-flex' },
  typeTag: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--text-muted,#6b7280)', background: 'var(--surface-hover,#f3f4f6)', padding: '3px 8px', borderRadius: 6 },
  pageSel: { border: '1px solid var(--border,#e5e7eb)', borderRadius: 7, padding: '3px 5px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-main,#374151)', background: 'var(--surface,#fff)', cursor: 'pointer' },
  miniBtn: { border: 'none', background: 'transparent', color: 'var(--text-muted,#6b7280)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'inline-flex' },
  qInput: { width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1.5px solid var(--border,#e5e7eb)', background: 'transparent', fontSize: 15, fontWeight: 600, color: 'var(--text-main,#111827)', outline: 'none', padding: '6px 2px' },
  help: { width: '100%', boxSizing: 'border-box', border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-muted,#6b7280)', outline: 'none', padding: '4px 2px', marginTop: 4 },
  optInput: { flex: 1, boxSizing: 'border-box', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, padding: '7px 10px', fontSize: 14, background: 'var(--surface,#fff)', color: 'var(--text-main,#111827)', outline: 'none' },
  addOpt: { display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: '#fe7a00', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 2px', alignSelf: 'flex-start' },
  inlineLbl: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted,#6b7280)', marginTop: 10 },
  scaleSel: { border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, padding: '5px 8px', fontSize: 13 },
  footRow: { display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border,#f0f1f3)' },
  reqToggle: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-main,#374151)', cursor: 'pointer' },
};

const P = {
  wrap: { padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  group: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted,#9ca3af)', marginTop: 10 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-main,#374151)' },
  color: { width: 44, height: 30, border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, background: 'none', cursor: 'pointer', padding: 2 },
  segRow: { display: 'flex', gap: 6, background: 'var(--surface-hover,#f3f4f6)', padding: 3, borderRadius: 10 },
  seg: { flex: 1, border: 'none', background: 'transparent', padding: '7px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', color: 'var(--text-muted,#6b7280)' },
  segOn: { background: 'var(--surface,#fff)', color: '#c2410c', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  select: { width: '100%', boxSizing: 'border-box', border: '1px solid var(--border,#e5e7eb)', borderRadius: 9, padding: '9px 11px', fontSize: 13.5, background: 'var(--surface,#fff)', color: 'var(--text-main,#111827)', outline: 'none', fontFamily: 'inherit' },
  uploadBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px dashed var(--border,#cbd0d8)', background: 'transparent', borderRadius: 9, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-main,#374151)', width: '100%', justifyContent: 'center' },
  removeImg: { position: 'absolute', top: 6, right: 6, border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 6, padding: 3, cursor: 'pointer', display: 'inline-flex' },
  visCard: { display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', textAlign: 'left', border: '1px solid var(--border,#e5e7eb)', borderRadius: 11, padding: '11px 12px', background: 'transparent', cursor: 'pointer' },
  visOn: { borderColor: '#fe7a00', background: '#fe7a000a' },
  shareBox: { display: 'flex', gap: 6 },
  shareInput: { flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--border,#e5e7eb)', borderRadius: 9, padding: '8px 10px', fontSize: 12, background: 'var(--surface-hover,#f9fafb)', color: 'var(--text-main,#374151)' },
  copyBtn: { border: '1px solid var(--border,#e5e7eb)', background: 'transparent', borderRadius: 9, padding: '0 11px', cursor: 'pointer', color: 'var(--text-main,#374151)' },
  hint: { fontSize: 11.5, color: '#b45309' },
  senderHint: { fontSize: 11.5, color: 'var(--text-muted,#9ca3af)', lineHeight: 1.5 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0' },
  switch: { width: 36, height: 20, borderRadius: 999, position: 'relative', cursor: 'pointer', flex: 'none', transition: 'background .15s', display: 'inline-block' },
  knob: { position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.3)', transition: 'transform .15s' },
  // pages panel
  pagesHint: { fontSize: 12.5, color: 'var(--text-muted,#6b7280)', lineHeight: 1.5, background: 'var(--surface-hover,#f7f8fa)', borderRadius: 10, padding: 12, marginTop: 4 },
  pageCard: { border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', background: 'var(--surface,#fff)' },
  pageCardOn: { borderColor: '#fe7a00', background: '#fe7a0008' },
  pageCardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  pageChip: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: 'var(--text-muted,#6b7280)', background: 'var(--surface-hover,#eceef1)', padding: '3px 9px', borderRadius: 999 },
  pageChipOn: { color: '#fff', background: '#fe7a00' },
  pageDel: { border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 3, borderRadius: 6, display: 'inline-flex' },
  pageField: { width: '100%', boxSizing: 'border-box', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, padding: '7px 10px', fontSize: 13, background: 'var(--surface,#fff)', color: 'var(--text-main,#111827)', outline: 'none', fontFamily: 'inherit' },
  bannerLabel: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted,#9ca3af)', marginTop: 6 },
  smallBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border,#e5e7eb)', background: 'transparent', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-main,#374151)' },
  addPageInspector: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px dashed var(--border,#cbd0d8)', background: 'transparent', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--text-main,#374151)', marginTop: 4 },
};
