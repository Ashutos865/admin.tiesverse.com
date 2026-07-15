import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, createProject, getHRDepartments, getOnboardingList } from '../../apiClient';
import { usePermissions } from '../../context/PermissionContext';
import SearchableSelect from '../../components/SearchableSelect';
import {
  Plus, Loader2, FolderKanban, Users, CalendarClock, AlertTriangle, X, Search, UserPlus,
} from 'lucide-react';

const PRIORITY_COLOR = { low: '#6b7280', medium: 'var(--primary)', high: '#f59e0b', urgent: '#ef4444' };
const STATUS_STYLE = {
  planning:  { bg: '#f3f4f6', color: '#6b7280', label: 'Planning' },
  active:    { bg: '#dbeafe', color: '#1e40af', label: 'Active' },
  on_hold:   { bg: '#fef3c7', color: '#92400e', label: 'On hold' },
  completed: { bg: '#d1fae5', color: '#065f46', label: 'Completed' },
  cancelled: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled' },
};
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const field = { padding: '9px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--outline-variant)', color: 'var(--text-main)', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 8, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'var(--surface-container-low)', color: fg || 'var(--text-main)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 });

function Countdown({ project }) {
  if (!project.deadline) return <span style={{ color: 'var(--text-muted)' }}>No deadline</span>;
  const d = project.days_left;
  if (project.status === 'completed') return <span style={{ color: '#065f46' }}>Completed</span>;
  if (d < 0) return <span style={{ color: '#dc2626', fontWeight: 700 }}><AlertTriangle size={12} style={{ verticalAlign: -1 }} /> {Math.abs(d)}d overdue</span>;
  if (d === 0) return <span style={{ color: '#dc2626', fontWeight: 700 }}>Due today</span>;
  return <span style={{ color: d <= 3 ? '#f59e0b' : 'var(--text-muted)' }}>{d}d left</span>;
}

function ProgressBar({ value }) {
  return (
    <div style={{ height: 6, borderRadius: 6, background: 'var(--outline-variant)', overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: value === 100 ? '#16a34a' : 'var(--primary)', transition: 'width .3s' }} />
    </div>
  );
}

export default function ProjectsPage() {
  const nav = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('add_project');

  const [projects, setProjects] = useState([]);
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), err ? 5000 : 2500); };

  const [members, setMembers] = useState([]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, ds, ms] = await Promise.all([getProjects(), getHRDepartments(), getOnboardingList()]);
      setProjects(Array.isArray(ps) ? ps : (ps?.results || []));
      setDepts((Array.isArray(ds) ? ds : (ds?.results || [])).filter((d) => d.is_active !== false));
      setMembers(Array.isArray(ms) ? ms : (ms?.results || []));
    } catch (e) { showToast(e.message || 'Failed to load', true); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = projects.filter((p) =>
    (statusFilter === 'all' || p.status === statusFilter) &&
    (!q || p.title.toLowerCase().includes(q.toLowerCase())));

  return (
    <div style={{ padding: '26px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}><FolderKanban size={22} /> Projects</h1>
        {canCreate && <button onClick={() => setShowCreate(true)} style={btn('var(--primary)', '#fff')}><Plus size={16} /> New Project</button>}
      </div>
      <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: 13.5 }}>
        {canCreate ? 'Create projects for your team or across departments, prioritise, assign tasks and track progress.' : 'Projects you’re part of, with their tasks and updates.'}
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-muted)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" style={{ ...field, paddingLeft: 34 }} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...field, width: 'auto' }}>
          <option value="all">All statuses</option>
          {Object.keys(STATUS_STYLE).map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 30, display: 'flex', gap: 8 }}><Loader2 size={18} className="ma-spin" /> Loading projects…</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <FolderKanban size={40} style={{ opacity: 0.4 }} />
          <p style={{ marginTop: 12, fontSize: 15 }}>{projects.length === 0 ? 'No projects yet.' : 'No projects match your filter.'}</p>
          {canCreate && projects.length === 0 && <button onClick={() => setShowCreate(true)} style={{ ...btn('var(--primary)', '#fff'), margin: '10px auto 0' }}><Plus size={16} /> Create the first project</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
          {visible.map((p) => {
            const st = STATUS_STYLE[p.status] || STATUS_STYLE.planning;
            return (
              <div key={p.id} onClick={() => nav(`/projects/${p.id}`)} style={{ cursor: 'pointer', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, transition: 'box-shadow .2s, transform .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[p.priority], textTransform: 'uppercase', letterSpacing: '.04em' }}>{p.priority}</span>
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 16.5, color: 'var(--text-main)', lineHeight: 1.25 }}>{p.title}</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.scope === 'all' ? 'All departments' : (p.departments || []).join(', ') || 'No department'}</div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 5 }}>
                    <span>{p.task_stats?.done || 0}/{(p.task_stats?.total || 0) - (p.task_stats?.cancelled || 0)} tasks</span>
                    <span>{p.progress}%</span>
                  </div>
                  <ProgressBar value={p.progress} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--outline-variant)', paddingTop: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Users size={13} /> {p.member_count}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarClock size={13} /> <Countdown project={p} /></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          depts={depts}
          members={members}
          onClose={() => setShowCreate(false)}
          onCreated={(p) => { setShowCreate(false); showToast('Project created.'); nav(`/projects/${p.id}`); }}
          onError={(m) => showToast(m, true)}
        />
      )}
      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: toast.err ? '#dc2626' : '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 1200 }}>{toast.m}</div>}
    </div>
  );
}

function CreateProjectModal({ depts, members = [], onClose, onCreated, onError }) {
  const [form, setForm] = useState({ title: '', description: '', scope: 'departments', priority: 'medium', start_date: '', deadline: '' });
  const [selected, setSelected] = useState({});   // {deptName: priority}
  const [people, setPeople] = useState([]);       // individually chosen member ids
  const [personSel, setPersonSel] = useState('');
  const [saving, setSaving] = useState(false);
  const addPerson = () => { if (personSel && !people.includes(Number(personSel))) setPeople((p) => [...p, Number(personSel)]); setPersonSel(''); };

  const toggleDept = (name) => setSelected((s) => {
    const n = { ...s };
    if (n[name]) delete n[name]; else n[name] = 'medium';
    return n;
  });

  const submit = async () => {
    if (!form.title.trim()) return onError('Title is required.');
    if (form.scope === 'departments' && Object.keys(selected).length === 0 && people.length === 0) return onError('Pick at least one department or person (or choose All departments).');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(), description: form.description.trim(),
        scope: form.scope, priority: form.priority,
        start_date: form.start_date || null, deadline: form.deadline || null,
        departments: form.scope === 'all' ? [] : Object.keys(selected),
        department_priorities: form.scope === 'all' ? {} : selected,
        members: people,
      };
      const p = await createProject(payload);
      onCreated(p);
    } catch (e) { onError(e.message || 'Could not create project.'); }
    setSaving(false);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--outline-variant)', position: 'sticky', top: 0, background: 'var(--surface)' }}>
          <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text-main)' }}>New Project</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={lbl}>Title *<input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={field} placeholder="e.g. Q3 Research Report" /></label>
          <label style={lbl}>Description<textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ ...field, resize: 'vertical' }} placeholder="What is this project about?" /></label>

          <div>
            <div style={{ ...lbl, marginBottom: 8 }}>Scope</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['departments', 'Selected departments'], ['all', 'All departments']].map(([v, label]) => (
                <button key={v} onClick={() => setForm((f) => ({ ...f, scope: v }))} style={{ ...btn(form.scope === v ? 'var(--primary)' : null, form.scope === v ? '#fff' : null), flex: 1, justifyContent: 'center' }}>{label}</button>
              ))}
            </div>
          </div>

          {form.scope === 'departments' && (
            <div>
              <div style={{ ...lbl, marginBottom: 8 }}>Departments &amp; their priority</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 220, overflowY: 'auto' }}>
                {depts.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No departments found.</span>}
                {depts.map((d) => {
                  const on = !!selected[d.name];
                  return (
                    <div key={d.id || d.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, border: `1px solid ${on ? 'var(--primary)' : 'var(--outline-variant)'}`, background: on ? 'var(--surface-container-low)' : 'transparent' }}>
                      <input type="checkbox" checked={on} onChange={() => toggleDept(d.name)} />
                      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-main)' }}>{d.name}</span>
                      {on && (
                        <select value={selected[d.name]} onChange={(e) => setSelected((s) => ({ ...s, [d.name]: e.target.value }))} style={{ ...field, width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                          {PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Individually-added people (in addition to any departments) */}
          <div>
            <div style={{ ...lbl, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><UserPlus size={14} /> Add specific people (optional)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <SearchableSelect
                options={members.filter((m) => !people.includes(m.id)).map((m) => ({ value: m.id, label: m.candidate_name, sub: (m.assigned_departments || []).join(', ') }))}
                value={personSel}
                onChange={setPersonSel}
                placeholder="— Select a person —"
                searchPlaceholder="Search person…"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button onClick={addPerson} disabled={!personSel} style={btn()}><Plus size={14} /> Add</button>
            </div>
            {people.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {people.map((id) => {
                  const m = members.find((x) => x.id === id);
                  return <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 16, padding: '4px 10px' }}>{m?.candidate_name || id}<button onClick={() => setPeople((p) => p.filter((x) => x !== id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={12} /></button></span>;
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={lbl}>Overall priority
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} style={field}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
              </select>
            </label>
            <label style={lbl}>Start date<input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} style={field} /></label>
            <label style={lbl}>Deadline<input type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} style={field} /></label>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 22px', borderTop: '1px solid var(--outline-variant)', position: 'sticky', bottom: 0, background: 'var(--surface)' }}>
          <button onClick={onClose} style={btn()}>Cancel</button>
          <button onClick={submit} disabled={saving} style={btn('var(--primary)', '#fff')}>{saving ? <Loader2 size={15} className="ma-spin" /> : <Plus size={15} />} Create project</button>
        </div>
      </div>
    </div>
  );
}

const lbl = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' };
