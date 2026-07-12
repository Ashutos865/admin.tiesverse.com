import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, X, Video, Search, BookOpen, Sparkles } from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import { getDomains, getCourses, createCourse, updateCourse, deleteCourse } from '../../apiClient';
import './Learn.css';

/* Extract a YouTube video id from a full URL or a raw 11-char id. */
export function ytId(s = '') {
  const m = String(s).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (String(s).length === 11 ? s : '');
}

const EMPTY = { title: '', domain: '', instructor: '', description: '', thumbnail_url: '', is_published: true };
const EMPTY_LESSON = { title: '', url: '', duration: '', kind: 'video' };

/* Small field helper that renders the same markup as the admin's .event-field */
function Field({ label, children }) {
  return (
    <label className="learn-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function ManageLearning() {
  const { hasPermission, isSuperuser } = usePermissions();
  const canManage = isSuperuser || hasPermission('add_course') || hasPermission('change_course');
  const canDelete = isSuperuser || hasPermission('delete_course');

  const [domains, setDomains] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [dom, setDom] = useState('all');
  const [toast, setToast] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [rows, setRows] = useState([{ ...EMPTY_LESSON }]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const show = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const load = () => {
    setLoading(true);
    getCourses('all=1').then((r) => setItems(Array.isArray(r) ? r : [])).finally(() => setLoading(false));
  };
  useEffect(() => { getDomains().then((d) => setDomains(Array.isArray(d) ? d : [])); load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY, domain: domains[0]?.id || '' });
    setRows([{ ...EMPTY_LESSON }]);
    setFormOpen(true);
  };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({ title: c.title, domain: c.domain, instructor: c.instructor || '', description: c.description || '', thumbnail_url: c.thumbnail_url || '', is_published: c.is_published });
    setRows((c.lessons || []).map((l) => ({ title: l.title, url: l.video_id || '', duration: l.duration || '', kind: l.kind || 'video' })).concat(c.lessons?.length ? [] : [{ ...EMPTY_LESSON }]));
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditingId(null); };

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { ...EMPTY_LESSON }]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return show('Course title is required');
    const lessons = rows.filter((r) => r.title.trim()).map((r, i) => ({
      title: r.title.trim(), order: i, duration: r.duration.trim(), kind: r.kind, video_id: ytId(r.url.trim()),
    }));
    if (!lessons.length) return show('Add at least one lesson');
    const missing = lessons.find((l, i) => rows[i]?.url && !l.video_id);
    if (missing) return show(`Check the YouTube link for "${missing.title}"`);

    setSaving(true);
    const payload = { ...form, lessons };
    const res = editingId ? await updateCourse(editingId, payload) : await createCourse(payload);
    setSaving(false);
    if (res?.id) { closeForm(); load(); show(editingId ? 'Course updated' : `"${form.title}" published with ${lessons.length} lesson(s)`); }
    else show(res?.error || 'Save failed');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteCourse(deleteTarget.id);
    setDeleteTarget(null);
    load();
    show('Course deleted');
  };
  const togglePublish = async (c) => {
    await updateCourse(c.id, { is_published: !c.is_published });
    setItems((xs) => xs.map((x) => (x.id === c.id ? { ...x, is_published: !x.is_published } : x)));
    show(!c.is_published ? `"${c.title}" published` : `"${c.title}" moved to draft`);
  };

  const list = items.filter((c) => (dom === 'all' || c.domain === dom) && c.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="learn-page">
      {toast && <div className="learn-toast">{toast}</div>}

      <header className="learn-heading">
        <div>
          <span className="learn-eyebrow">Learn Portal, content operations</span>
          <h1>Manage Learning</h1>
          <p>Add YouTube-hosted courses and lessons. Videos stay inside TIES LEARN, so members never leave the platform.</p>
        </div>
        {canManage && (
          <div className="learn-heading-actions">
            <button type="button" className="learn-primary-button" onClick={openCreate}>
              <Plus size={18} /> Add Course
            </button>
          </div>
        )}
      </header>

      <div className="learn-panel" style={{ padding: 0 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 18, borderBottom: '1px solid var(--outline-variant)' }}>
          <label className="learn-field" style={{ flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Search size={16} color="var(--text-muted)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" style={{ border: 0, background: 'transparent', padding: 0 }} />
          </label>
          <select className="learn-domain-select" value={dom} onChange={(e) => setDom(e.target.value)}
            style={{ padding: '9px 13px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-hover)', color: 'var(--text-main)' }}>
            <option value="all">All domains</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="learn-state"><BookOpen size={36} /><strong>Loading courses</strong></div>
        ) : !list.length ? (
          <div className="learn-state">
            <BookOpen size={36} />
            <strong>No courses yet</strong>
            <span>{canManage ? 'Click "Add Course" to publish your first one.' : 'Courses will appear here once published.'}</span>
          </div>
        ) : (
          <div className="learn-table-wrap">
            <table className="learn-table">
              <thead>
                <tr>
                  <th>Course</th><th>Domain</th><th>Lessons</th><th>Enrolled</th><th>Published</th><th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="learn-cell-title">
                        <span className="learn-thumb">{c.thumbnail_url ? <img src={c.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }} /> : <Video size={16} />}</span>
                        <span><strong>{c.title}</strong><small>{c.instructor || 'TIES Mentor'}</small></span>
                      </div>
                    </td>
                    <td><span className="learn-badge">{c.domain_name || c.domain}</span></td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{c.lesson_count ?? 0}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{c.enrolled_count ?? 0}</td>
                    <td>
                      <button type="button" className={`learn-toggle ${c.is_published ? 'is-on' : ''}`} disabled={!canManage}
                        title={c.is_published ? 'Published' : 'Draft'} onClick={() => togglePublish(c)} aria-label="Toggle published" />
                    </td>
                    <td>
                      <div className="learn-row-actions">
                        {canManage && <button type="button" className="learn-icon-button" onClick={() => openEdit(c)} aria-label={`Edit ${c.title}`}><Edit2 size={17} /></button>}
                        {canDelete && <button type="button" className="learn-icon-button is-danger" onClick={() => setDeleteTarget(c)} aria-label={`Delete ${c.title}`}><Trash2 size={17} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* create / edit modal */}
      {formOpen && (
        <div className="learn-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
          <div className="learn-modal">
            <div className="learn-modal-header">
              <div><Sparkles size={20} /><h2>{editingId ? 'Edit Course' : 'Create New Course'}</h2></div>
              <button type="button" onClick={closeForm} aria-label="Close"><X size={18} /></button>
            </div>

            <form onSubmit={submit}>
              <Field label="Course Title *">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Version Control with Git, Basics" required />
              </Field>
              <div className="learn-form-grid two">
                <Field label="Domain">
                  <select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
                    {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Instructor">
                  <input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} placeholder="Rohan Shah" />
                </Field>
              </div>
              <Field label="Short Description">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="One line shown on the course card." />
              </Field>
              <Field label="Cover Image URL">
                <input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} placeholder="https://..." />
              </Field>

              <label className="learn-field">
                <span>Lessons, paste a YouTube link or video ID per lesson</span>
                <div className="learn-lesson-rows">
                  {rows.map((r, i) => {
                    const id = ytId(r.url);
                    return (
                      <div className="learn-lesson-row" key={i}>
                        <span className="learn-num">{i + 1}</span>
                        <input placeholder="Lesson title" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} />
                        <input className={id ? 'is-valid' : ''} placeholder="YouTube link or ID" value={r.url} onChange={(e) => setRow(i, { url: e.target.value })} />
                        <input placeholder="mm:ss" value={r.duration} onChange={(e) => setRow(i, { duration: e.target.value })} />
                        <button type="button" className="learn-icon-button" onClick={() => removeRow(i)} aria-label="Remove lesson"><X size={15} /></button>
                      </div>
                    );
                  })}
                </div>
                {rows.some((r) => ytId(r.url)) && <span className="learn-lesson-hint"><Video size={13} /> YouTube links detected and validated</span>}
                <button type="button" className="learn-ghost-button" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={addRow}><Plus size={15} /> Add lesson</button>
              </label>

              <div className="learn-modal-actions">
                <button type="button" onClick={closeForm}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving' : editingId ? 'Update Course' : 'Publish Course'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* delete confirm */}
      {deleteTarget && (
        <div className="learn-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="learn-delete-modal">
            <span><Trash2 size={24} /></span>
            <h2>Delete Course?</h2>
            <p>Remove <strong>"{deleteTarget.title}"</strong> and its lessons from the catalog. This cannot be undone.</p>
            <div>
              <button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="learn-confirm" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
