import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getProject, getTasks, createTask, updateTask, getOnboardingList,
  extendProjectDeadline, setProjectStatus, addProjectMember, removeProjectMember,
  getProjectDeadlineChanges, deleteProject, addProjectDepartment,
  getChecklist, createChecklistItem, updateChecklistItem, deleteChecklistItem,
  createProjectTeam, updateProjectTeam, deleteProjectTeam, assignMemberTeam,
  getMilestones, createMilestone, updateMilestone, deleteMilestone,
  getAttachments, createAttachment, deleteAttachment, exportProjectCsv, uploadImage,
  getTaskSteps, createTaskStep, updateTaskStep, deleteTaskStep, getMe,
} from '../../apiClient';
import { usePermissions } from '../../context/PermissionContext';
import ProjectChat from './ProjectChat.jsx';
import {
  ArrowLeft, Loader2, Plus, CalendarClock, Users, AlertTriangle, X, Trash2,
  History, ClipboardList, Settings2, Flag, MessageSquare, CheckSquare, Square, ListChecks, Building2,
  Layers, Milestone, Paperclip, Download, Search, Link2,
} from 'lucide-react';

const PRIORITY_COLOR = { low: '#6b7280', medium: 'var(--primary)', high: '#f59e0b', urgent: '#ef4444' };
const STATUS_STYLE = {
  planning: { bg: '#f3f4f6', color: '#6b7280', label: 'Planning' },
  active: { bg: '#dbeafe', color: '#1e40af', label: 'Active' },
  on_hold: { bg: '#fef3c7', color: '#92400e', label: 'On hold' },
  completed: { bg: '#d1fae5', color: '#065f46', label: 'Completed' },
  cancelled: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled' },
};
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const KANBAN = [
  { key: 'todo', label: 'To Do' }, { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'In Review' }, { key: 'done', label: 'Done' },
];
const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const field = { padding: '9px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--outline-variant)', color: 'var(--text-main)', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'var(--surface-container-low)', color: fg || 'var(--text-main)', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const lbl = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' };

export default function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [changes, setChanges] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [taskTeamFilter, setTaskTeamFilter] = useState('');   // '' = all
  const [q, setQ] = useState('');                             // in-project search
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);   // 'task' | 'extend' | 'addmember' | 'adddept' | 'team'
  const [openTask, setOpenTask] = useState(null);  // task whose workflow panel is open
  const [meId, setMeId] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), err ? 5000 : 2500); };

  // Per-project rights come from the API (project.can_manage / can_delete), so a
  // Team Lead only manages their OWN projects — not every project.
  const canManage = !!project?.can_manage;
  const canDelete = !!project?.can_delete;
  const canAddTask = !!project?.can_manage;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [p, ts, ms, ch, cl, mi, at] = await Promise.all([
        getProject(id), getTasks({ project: id }), getOnboardingList(), getProjectDeadlineChanges(id),
        getChecklist(id), getMilestones(id), getAttachments(id),
      ]);
      setProject(p);
      setTasks(Array.isArray(ts) ? ts : (ts?.results || []));
      setMembers(Array.isArray(ms) ? ms : (ms?.results || []));
      setChanges(Array.isArray(ch) ? ch : []);
      setChecklist(Array.isArray(cl) ? cl : (cl?.results || []));
      setMilestones(Array.isArray(mi) ? mi : (mi?.results || []));
      setAttachments(Array.isArray(at) ? at : (at?.results || []));
    } catch (e) { showToast(e.message || 'Failed to load project', true); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getMe().then((m) => setMeId(m?.member?.id || null)).catch(() => {}); }, []);

  const teams = project?.teams || [];

  const addChecklist = async () => {
    const text = newItem.trim();
    if (!text) return;
    try { const it = await createChecklistItem({ project: id, text, order: checklist.length }); setChecklist((c) => [...c, it]); setNewItem(''); }
    catch (e) { showToast(e.message || 'Could not add item', true); }
  };
  const toggleChecklist = async (item) => {
    try { const up = await updateChecklistItem(item.id, { is_done: !item.is_done }); setChecklist((c) => c.map((x) => (x.id === item.id ? up : x))); }
    catch (e) { showToast(e.message || 'Could not update', true); }
  };
  const removeChecklist = async (item) => {
    try { await deleteChecklistItem(item.id); setChecklist((c) => c.filter((x) => x.id !== item.id)); }
    catch (e) { showToast(e.message || 'Could not remove', true); }
  };

  // milestones
  const addMilestone = async (title, due_date) => {
    try { const m = await createMilestone({ project: id, title, due_date: due_date || null, order: milestones.length }); setMilestones((x) => [...x, m]); }
    catch (e) { showToast(e.message || 'Could not add milestone', true); }
  };
  const toggleMilestone = async (m) => {
    try { const up = await updateMilestone(m.id, { is_done: !m.is_done }); setMilestones((x) => x.map((y) => (y.id === m.id ? up : y))); }
    catch (e) { showToast(e.message || 'Could not update', true); }
  };
  const removeMilestone = async (m) => {
    try { await deleteMilestone(m.id); setMilestones((x) => x.filter((y) => y.id !== m.id)); }
    catch (e) { showToast(e.message || 'Could not remove', true); }
  };

  // attachments
  const addAttachmentLink = async (name, url) => {
    try { const a = await createAttachment({ project: id, name, url }); setAttachments((x) => [a, ...x]); }
    catch (e) { showToast(e.message || 'Could not add attachment', true); }
  };
  const uploadAttachment = async (file) => {
    try {
      const res = await uploadImage(file);
      const url = res?.url || res?.secure_url || res?.data?.url;
      if (!url) return showToast('Upload failed (images only for direct upload — use a link for other files).', true);
      await addAttachmentLink(file.name, url);
      showToast('Attachment added.');
    } catch (e) { showToast(e.message || 'Upload failed', true); }
  };
  const removeAttachment = async (a) => {
    try { await deleteAttachment(a.id); setAttachments((x) => x.filter((y) => y.id !== a.id)); }
    catch (e) { showToast(e.message || 'Could not remove', true); }
  };

  // sub-teams (silent refresh so the page doesn't jump to the top)
  const addTeam = async (name, description) => {
    try { await createProjectTeam({ project: id, name, description: description || '' }); load(true); }
    catch (e) { showToast(e.message || 'Could not create team', true); }
  };
  const updateTeam = async (teamId, data) => {
    try { await updateProjectTeam(teamId, data); load(true); }
    catch (e) { showToast(e.message || 'Could not update team', true); }
  };
  const removeTeam = async (t) => {
    try { await deleteProjectTeam(t.id); load(true); }
    catch (e) { showToast(e.message || 'Could not delete team', true); }
  };
  const assignTeam = async (memberId, teamIds) => {
    // optimistic local update, then a silent reconcile — no spinner, no scroll jump
    setProject((p) => (p ? { ...p, members: (p.members || []).map((pm) => (pm.member === memberId ? { ...pm, teams: teamIds } : pm)) } : p));
    try { await assignMemberTeam(id, memberId, teamIds); load(true); }
    catch (e) { showToast(e.message || 'Could not assign team', true); load(true); }
  };
  const memberTeamsOf = (memberId) => (project?.members || []).find((pm) => pm.member === memberId)?.teams || [];
  const addToTeam = (memberId, teamId) => assignTeam(memberId, Array.from(new Set([...memberTeamsOf(memberId), teamId])));
  const removeFromTeam = (memberId, teamId) => assignTeam(memberId, memberTeamsOf(memberId).filter((x) => x !== teamId));

  const doExport = () => exportProjectCsv(id, project?.title).catch((e) => showToast(e.message || 'Export failed', true));

  const moveTask = async (task, status) => {
    try { await updateTask(task.id, { status }); setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t))); }
    catch (e) { showToast(e.message || 'Could not update task', true); }
  };
  const changeStatus = async (status) => {
    try { const p = await setProjectStatus(id, status); setProject(p); showToast(status === 'completed' ? 'Marked complete. Chats erase in 15 days.' : `Status: ${cap(status)}`); }
    catch (e) { showToast(e.message || 'Could not change status', true); }
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', display: 'flex', gap: 8 }}><Loader2 size={18} className="ma-spin" /> Loading…</div>;
  if (!project) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Project not found.</div>;

  const st = STATUS_STYLE[project.status] || STATUS_STYLE.planning;
  const done = project.task_stats?.done || 0;
  const totalActive = (project.task_stats?.total || 0) - (project.task_stats?.cancelled || 0);

  return (
    <div style={{ padding: '22px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <button onClick={() => nav('/projects')} style={{ ...btn(), marginBottom: 16 }}><ArrowLeft size={15} /> All projects</button>

      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: PRIORITY_COLOR[project.priority], textTransform: 'uppercase', letterSpacing: '.04em' }}><Flag size={11} style={{ verticalAlign: -1 }} /> {project.priority}</span>
            {project.is_overdue && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#dc2626' }}><AlertTriangle size={11} style={{ verticalAlign: -1 }} /> Overdue</span>}
          </div>
          <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-main)' }}>{project.title}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {project.scope === 'all' ? 'All departments' : (project.departments || []).join(', ')} · created by {project.created_by_name || '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={doExport} style={btn()}><Download size={15} /> Export CSV</button>
          {canManage && (
            <>
              <select value={project.status} onChange={(e) => changeStatus(e.target.value)} style={{ ...field, width: 'auto' }}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
              </select>
              <button onClick={() => setModal('extend')} style={btn()}><CalendarClock size={15} /> Extend deadline</button>
            </>
          )}
        </div>
      </div>

      {/* meta strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '18px 0 8px' }}>
        <Meta label="Progress" value={`${project.progress}% · ${done}/${totalActive} tasks`} />
        <Meta label="Deadline" value={fmtDate(project.deadline)} sub={project.days_left != null ? (project.days_left < 0 ? `${Math.abs(project.days_left)}d overdue` : `${project.days_left}d left`) : ''} />
        <Meta label="Started" value={fmtDate(project.start_date)} />
        <Meta label="Members" value={project.member_count} />
        {project.completed_at && <Meta label="Chats erase" value={fmtDate(project.chat_purge_at)} sub="15 days after completion" />}
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--outline-variant)', margin: '16px 0 20px' }}>
        {[['overview', 'Overview', Settings2], ['tasks', `Tasks (${tasks.length})`, ClipboardList], ['chat', 'Chat', MessageSquare], ['team', `People (${project.members?.length || 0})`, Users], ['teams', `Sub-teams (${teams.length})`, Layers], ['timeline', 'Timeline', History]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: tab === k ? 'var(--primary)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === k ? 'var(--primary)' : 'transparent'}`, marginBottom: -1 }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Pinned "what to do" — visible to everyone */}
          <div style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ListChecks size={17} style={{ color: 'var(--primary)' }} />
              <h3 style={{ ...h3, margin: 0 }}>What to do — pinned for everyone</h3>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{checklist.filter((c) => c.is_done).length}/{checklist.length} done</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {checklist.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>{canManage ? 'Add the project’s to-do items below — everyone will see them.' : 'No items yet.'}</p>}
              {checklist.map((it) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
                  <button onClick={() => toggleChecklist(it)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: it.is_done ? 'var(--primary)' : 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}>
                    {it.is_done ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  <span style={{ flex: 1, fontSize: 14, color: it.is_done ? 'var(--text-muted)' : 'var(--text-main)', textDecoration: it.is_done ? 'line-through' : 'none' }}>{it.text}</span>
                  {canManage && <button onClick={() => removeChecklist(it)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}><Trash2 size={14} /></button>}
                </div>
              ))}
            </div>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addChecklist(); }} placeholder="Add a to-do item…" style={field} />
                <button onClick={addChecklist} disabled={!newItem.trim()} style={btn('var(--primary)', '#fff')}><Plus size={15} /> Add</button>
              </div>
            )}
          </div>

          {/* Milestones + Attachments */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            <MilestonesPanel milestones={milestones} canManage={canManage} onAdd={addMilestone} onToggle={toggleMilestone} onRemove={removeMilestone} />
            <AttachmentsPanel attachments={attachments} onUpload={uploadAttachment} onAddLink={addAttachmentLink} onRemove={removeAttachment} canManage={canManage} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 20 }}>
            <div style={panel}>
              <h3 style={h3}>About</h3>
              <p style={{ color: project.description ? 'var(--text-main)' : 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{project.description || 'No description.'}</p>
            </div>
            <div style={panel}>
              <h3 style={h3}>Department priorities</h3>
              {project.scope === 'all' ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Org-wide — all departments.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(project.departments || []).map((d) => (
                    <div key={d} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                      <span style={{ color: 'var(--text-main)' }}>{d}</span>
                      <span style={{ fontWeight: 700, color: PRIORITY_COLOR[project.department_priorities?.[d] || project.priority], textTransform: 'uppercase', fontSize: 11.5 }}>{project.department_priorities?.[d] || project.priority}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'chat' && (
        <ProjectChat projectId={id} participants={project.members || []} teams={teams} canManage={canManage} onError={(m) => showToast(m, true)} />
      )}

      {tab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {canAddTask && <button onClick={() => setModal('task')} style={btn('var(--primary)', '#fff')}><Plus size={15} /> Add task</button>}
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" style={{ ...field, paddingLeft: 32 }} />
            </div>
            {teams.length > 0 && (
              <select value={taskTeamFilter} onChange={(e) => setTaskTeamFilter(e.target.value)} style={{ ...field, width: 'auto' }}>
                <option value="">All sub-teams</option>
                <option value="none">No team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, overflowX: 'auto' }}>
            {KANBAN.map((col) => {
              const teamName = (tid) => teams.find((t) => t.id === tid)?.name;
              const colTasks = tasks.filter((t) => t.status === col.key
                && (!q || t.title.toLowerCase().includes(q.toLowerCase()))
                && (!taskTeamFilter || (taskTeamFilter === 'none' ? !t.project_team : String(t.project_team) === String(taskTeamFilter))));
              return (
                <div key={col.key} style={{ background: 'var(--surface-container-low)', borderRadius: 12, padding: 12, minWidth: 200 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>{col.label} · {colTasks.length}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colTasks.map((t) => (
                      <div key={t.id} onClick={() => setOpenTask(t)} style={{ background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 9, padding: 11, cursor: 'pointer' }}>
                        <div style={{ fontSize: 13.5, color: 'var(--text-main)', fontWeight: 600, marginBottom: 5 }}>{t.title}</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                          {t.project_team && teamName(t.project_team) && <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', borderRadius: 6, padding: '1px 7px' }}>{teamName(t.project_team)}</span>}
                          {t.steps_total > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: t.steps_done === t.steps_total ? '#065f46' : 'var(--text-muted)', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 6, padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}><ListChecks size={10} /> {t.steps_done}/{t.steps_total}</span>}
                          {t.estimated_hours ? <span style={{ fontSize: 10, fontWeight: 700, color: (t.actual_hours || 0) > t.estimated_hours ? '#dc2626' : 'var(--text-muted)', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 6, padding: '1px 7px' }}>⏱ {t.actual_hours || 0}/{t.estimated_hours}h</span> : null}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                          <span>{t.assigned_to_name || t.assigned_to_department || '—'}</span>
                          <span style={{ fontWeight: 700, color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
                        </div>
                        {canAddTask && (
                          <select value={t.status} onClick={(e) => e.stopPropagation()} onChange={(e) => moveTask(t, e.target.value)} style={{ ...field, padding: '4px 6px', fontSize: 11, marginTop: 8 }}>
                            {KANBAN.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                            <option value="cancelled">Cancelled</option>
                          </select>
                        )}
                      </div>
                    ))}
                    {colTasks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 2px' }}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'teams' && (
        <div style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ ...h3, margin: 0 }}>Sub-teams</h3>
            {canManage && <button onClick={() => setModal('team')} style={btn()}><Plus size={14} /> New sub-team</button>}
          </div>
          {teams.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sub-teams yet. {canManage ? 'Create one, then assign people below.' : ''}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {teams.map((t) => (
              <TeamCard key={t.id} team={t} members={project.members || []} canManage={canManage}
                onAdd={(mid) => addToTeam(mid, t.id)} onRemovePerson={(mid) => removeFromTeam(mid, t.id)}
                onUpdate={(data) => updateTeam(t.id, data)} onDelete={() => removeTeam(t)} />
            ))}
          </div>

          {canManage && teams.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--outline-variant)', paddingTop: 16 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--text-main)' }}>Assign people to sub-teams</h4>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>Tap a team to add/remove — a person can be in several.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(project.members || []).map((pm) => {
                  const memberTeams = pm.teams || [];
                  return (
                    <div key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 140, color: 'var(--text-main)' }}>{pm.member_name}</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {teams.map((t) => {
                          const on = memberTeams.includes(t.id);
                          return (
                            <button key={t.id} onClick={() => assignTeam(pm.member, on ? memberTeams.filter((x) => x !== t.id) : [...memberTeams, t.id])}
                              style={{ ...btn(on ? '#7c3aed' : null, on ? '#fff' : null), padding: '4px 10px', fontSize: 12 }}>
                              {on ? <CheckSquare size={12} /> : <Plus size={12} />} {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'team' && (
        <div style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ ...h3, margin: 0 }}>Participants</h3>
            {canManage && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModal('adddept')} style={btn()}><Building2 size={14} /> Add department</button>
                <button onClick={() => setModal('addmember')} style={btn()}><Plus size={14} /> Add person</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(project.members || []).map((pm) => (
              <div key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--outline-variant)', borderRadius: 9 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{(pm.member_name || '?').slice(0, 1).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--text-main)' }}>{pm.member_name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{(pm.member_departments || []).join(', ')}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: pm.role === 'lead' ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase' }}>{pm.role}</span>
                {canManage && pm.role !== 'lead' && (
                  <button onClick={async () => { await removeProjectMember(id, pm.member); load(true); }} style={{ ...btn(), padding: 6, color: '#dc2626' }}><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div style={panel}>
          <h3 style={h3}>Deadline history</h3>
          {changes.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No deadline changes yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {changes.map((c) => (
                <div key={c.id} style={{ borderLeft: '2px solid var(--primary)', paddingLeft: 12 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--text-main)' }}>{fmtDate(c.old_deadline)} → <strong>{fmtDate(c.new_deadline)}</strong></div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.changed_by_name} · {fmtDate(c.created_at)}{c.reason ? ` · ${c.reason}` : ''}</div>
                </div>
              ))}
            </div>
          )}
          {canDelete && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--outline-variant)' }}>
              <button onClick={async () => { if (window.confirm('Delete this project and its tasks/chats? This cannot be undone.')) { await deleteProject(id); nav('/projects'); } }} style={{ ...btn(), color: '#dc2626', borderColor: '#fecaca' }}><Trash2 size={14} /> Delete project</button>
            </div>
          )}
        </div>
      )}

      {modal === 'task' && <TaskModal projectId={id} members={members} teams={teams} departments={project.scope === 'all' ? [] : project.departments} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(true); }} onError={(m) => showToast(m, true)} />}
      {modal === 'team' && <TeamModal onClose={() => setModal(null)} onSave={async (name, description) => { setModal(null); await addTeam(name, description); }} />}
      {openTask && <TaskPanel task={openTask} canEdit={canManage || openTask.assigned_to === meId} onClose={() => { setOpenTask(null); load(true); }} onError={(m) => showToast(m, true)} />}
      {modal === 'extend' && <ExtendModal current={project.deadline} onClose={() => setModal(null)} onSave={async (d, reason) => { try { const p = await extendProjectDeadline(id, { new_deadline: d, reason }); setProject(p); setModal(null); load(); showToast('Deadline updated.'); } catch (e) { showToast(e.message, true); } }} />}
      {modal === 'addmember' && <AddMemberModal members={members} existing={(project.members || []).map((m) => m.member)} onClose={() => setModal(null)} onSave={async (mid) => { try { await addProjectMember(id, { member: mid }); setModal(null); load(true); } catch (e) { showToast(e.message, true); } }} />}
      {modal === 'adddept' && <AddDepartmentModal members={members} onClose={() => setModal(null)} onSave={async (depts) => { try { const r = await addProjectDepartment(id, depts); setModal(null); load(true); showToast(`Added ${r.added} member(s).`); } catch (e) { showToast(e.message, true); } }} />}

      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: toast.err ? '#dc2626' : '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 1200 }}>{toast.m}</div>}
    </div>
  );
}

const panel = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 18 };
const h3 = { margin: '0 0 12px', fontSize: 14.5, color: 'var(--text-main)' };

function Meta({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 15, color: 'var(--text-main)', fontWeight: 600, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

function Overlay({ title, onClose, children, footer }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--outline-variant)' }}>
          <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text-main)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 22px', borderTop: '1px solid var(--outline-variant)' }}>{footer}</div>
      </div>
    </div>
  );
}

function TaskModal({ projectId, members, teams = [], departments, onClose, onSaved, onError }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assigned_to: '', assigned_to_department: '', project_team: '', estimated_hours: '', due_date: '' });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.title.trim()) return onError('Task title is required.');
    if (!form.assigned_to && !form.assigned_to_department && !form.project_team) return onError('Assign to a person, a department, or a sub-team.');
    setSaving(true);
    try {
      const payload = { ...form, project: projectId };
      if (!payload.assigned_to) delete payload.assigned_to;
      if (!payload.assigned_to_department) delete payload.assigned_to_department;
      if (!payload.project_team) delete payload.project_team;
      if (!payload.due_date) delete payload.due_date;
      if (payload.estimated_hours === '' || payload.estimated_hours == null) delete payload.estimated_hours;
      else payload.estimated_hours = Number(payload.estimated_hours);
      await createTask(payload);
      onSaved();
    } catch (e) { onError(e.message || 'Could not create task.'); }
    setSaving(false);
  };
  return (
    <Overlay title="Add task" onClose={onClose} footer={<><button onClick={onClose} style={btn()}>Cancel</button><button onClick={submit} disabled={saving} style={btn('var(--primary)', '#fff')}>{saving ? <Loader2 size={15} className="ma-spin" /> : <Plus size={15} />} Add</button></>}>
      <label style={lbl}>Title *<input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={field} /></label>
      <label style={lbl}>Description<textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ ...field, resize: 'vertical' }} /></label>
      <label style={lbl}>Assign to person
        <select value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value, assigned_to_department: '' }))} style={field}>
          <option value="">— Select member —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.candidate_name}</option>)}
        </select>
      </label>
      {(departments || []).length > 0 && (
        <label style={lbl}>…or a whole department
          <select value={form.assigned_to_department} onChange={(e) => setForm((f) => ({ ...f, assigned_to_department: e.target.value, assigned_to: '' }))} style={field}>
            <option value="">— Select department —</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      )}
      {teams.length > 0 && (
        <label style={lbl}>…or a sub-team
          <select value={form.project_team} onChange={(e) => setForm((f) => ({ ...f, project_team: e.target.value }))} style={field}>
            <option value="">— Select sub-team —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <label style={lbl}>Priority<select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} style={field}>{PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}</select></label>
        <label style={lbl}>Est. hours<input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={(e) => setForm((f) => ({ ...f, estimated_hours: e.target.value }))} style={field} placeholder="e.g. 8" /></label>
        <label style={lbl}>Due date<input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} style={field} /></label>
      </div>
    </Overlay>
  );
}

function TeamModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <Overlay title="New sub-team" onClose={onClose} footer={<><button onClick={onClose} style={btn()}>Cancel</button><button onClick={() => name.trim() && onSave(name.trim(), description.trim())} disabled={!name.trim()} style={btn('var(--primary)', '#fff')}><Plus size={15} /> Create</button></>}>
      <label style={lbl}>Team name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={field} placeholder="e.g. Design squad" /></label>
      <label style={lbl}>Description (optional)<textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...field, resize: 'vertical' }} placeholder="What is this team responsible for?" /></label>
    </Overlay>
  );
}

function TaskPanel({ task, canEdit, onClose, onError }) {
  const [steps, setSteps] = useState(null);
  const [text, setText] = useState('');
  useEffect(() => { getTaskSteps(task.id).then((r) => setSteps(Array.isArray(r) ? r : (r?.results || []))).catch(() => setSteps([])); }, [task.id]);
  const add = async () => {
    const t = text.trim(); if (!t) return;
    try { const s = await createTaskStep({ task: task.id, text: t, order: (steps || []).length }); if (s?.id) { setSteps((x) => [...x, s]); setText(''); } else onError(s?.error || 'Could not add step'); }
    catch (e) { onError(e.message || 'Could not add step'); }
  };
  const toggle = async (s) => {
    try { const up = await updateTaskStep(s.id, { is_done: !s.is_done }); if (up?.id) setSteps((x) => x.map((y) => (y.id === s.id ? up : y))); }
    catch (e) { onError(e.message || 'Could not update'); }
  };
  const remove = async (s) => {
    try { await deleteTaskStep(s.id); setSteps((x) => x.filter((y) => y.id !== s.id)); }
    catch (e) { onError(e.message || 'Could not remove'); }
  };
  const done = (steps || []).filter((s) => s.is_done).length;
  return (
    <Overlay title="Task workflow" onClose={onClose} footer={<button onClick={onClose} style={btn('var(--primary)', '#fff')}>Done</button>}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>{task.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
          {task.assigned_to_name || task.assigned_to_department || 'Unassigned'} · <span style={{ color: PRIORITY_COLOR[task.priority], fontWeight: 700 }}>{task.priority}</span> · {cap(task.status)}
          {task.estimated_hours ? <> · ⏱ <strong style={{ color: (task.actual_hours || 0) > task.estimated_hours ? '#dc2626' : 'var(--text-main)' }}>{task.actual_hours || 0}/{task.estimated_hours}h</strong></> : null}
        </div>
        {task.description && <p style={{ fontSize: 13.5, color: 'var(--text-main)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{task.description}</p>}
      </div>
      <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ListChecks size={16} style={{ color: 'var(--primary)' }} />
          <strong style={{ fontSize: 13.5, color: 'var(--text-main)' }}>Steps — how to do this work</strong>
          {steps && steps.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{done}/{steps.length}</span>}
        </div>
        {steps === null ? <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', gap: 6 }}><Loader2 size={15} className="ma-spin" /> Loading…</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {steps.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>{canEdit ? 'Break the work into steps below.' : 'No steps defined yet.'}</p>}
            {steps.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <button onClick={() => canEdit && toggle(s)} disabled={!canEdit} style={{ background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', color: s.is_done ? 'var(--primary)' : 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}>{s.is_done ? <CheckSquare size={17} /> : <Square size={17} />}</button>
                <span style={{ flex: 1, fontSize: 13.5, color: s.is_done ? 'var(--text-muted)' : 'var(--text-main)', textDecoration: s.is_done ? 'line-through' : 'none' }}>{s.text}</span>
                {canEdit && <button onClick={() => remove(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}><Trash2 size={13} /></button>}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Add a step…" style={field} />
            <button onClick={add} disabled={!text.trim()} style={btn('var(--primary)', '#fff')}><Plus size={15} /> Add</button>
          </div>
        )}
      </div>
    </Overlay>
  );
}

function TeamCard({ team, members, canManage, onAdd, onRemovePerson, onUpdate, onDelete }) {
  const [sel, setSel] = useState('');
  const [editDesc, setEditDesc] = useState(false);
  const [desc, setDesc] = useState(team.description || '');
  const inTeam = members.filter((pm) => (pm.teams || []).includes(team.id));
  const available = members.filter((pm) => !(pm.teams || []).includes(team.id));
  const add = () => { if (sel) { onAdd(Number(sel)); setSel(''); } };
  return (
    <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 14, color: 'var(--text-main)' }}><Layers size={14} style={{ verticalAlign: -2, color: '#7c3aed' }} /> {team.name} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>· {inTeam.length}</span></strong>
          {team.lead_name && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', borderRadius: 6, padding: '1px 7px' }}>Lead: {team.lead_name}</span>}
        </div>
        {canManage && <button onClick={onDelete} style={{ ...btn(), padding: 6, color: '#dc2626', flexShrink: 0 }}><Trash2 size={13} /></button>}
      </div>

      {/* description */}
      {editDesc ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...field, padding: '6px 9px', fontSize: 12.5 }} placeholder="Team description…" />
          <button onClick={() => { onUpdate({ description: desc }); setEditDesc(false); }} style={btn('var(--primary)', '#fff')}>Save</button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: team.description ? 'var(--text-main)' : 'var(--text-muted)', marginBottom: 8 }}>
          {team.description || 'No description.'}{canManage && <button onClick={() => { setDesc(team.description || ''); setEditDesc(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 11.5, marginLeft: 8 }}>edit</button>}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: canManage ? 10 : 0 }}>
        {inTeam.length === 0 ? <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No one assigned yet.</span> :
          inTeam.map((pm) => (
            <span key={pm.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, background: team.lead === pm.member ? '#f3e8ff' : 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 14, padding: '3px 6px 3px 10px' }}>
              {pm.member_name}
              {canManage && <button onClick={() => onRemovePerson(pm.member)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', padding: 0 }}><X size={12} /></button>}
            </span>
          ))}
      </div>

      {canManage && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ ...field, flex: 1, minWidth: 150, padding: '6px 9px', fontSize: 12.5 }}>
            <option value="">— Add a person to this team —</option>
            {available.map((pm) => <option key={pm.id} value={pm.member}>{pm.member_name}</option>)}
          </select>
          <button onClick={add} disabled={!sel} style={btn()}><Plus size={14} /> Add</button>
          {inTeam.length > 0 && (
            <select value={team.lead || ''} onChange={(e) => onUpdate({ lead: e.target.value || null })} style={{ ...field, width: 'auto', padding: '6px 9px', fontSize: 12.5 }} title="Set team lead">
              <option value="">— Set lead —</option>
              {inTeam.map((pm) => <option key={pm.id} value={pm.member}>Lead: {pm.member_name}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

function MilestonesPanel({ milestones, canManage, onAdd, onToggle, onRemove }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const submit = () => { if (title.trim()) { onAdd(title.trim(), due); setTitle(''); setDue(''); } };
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Milestone size={16} style={{ color: 'var(--primary)' }} /><h3 style={{ ...h3, margin: 0 }}>Milestones</h3>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{milestones.filter((m) => m.is_done).length}/{milestones.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {milestones.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No milestones yet.</p>}
        {milestones.map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => onToggle(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: m.is_done ? 'var(--primary)' : 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}>{m.is_done ? <CheckSquare size={16} /> : <Square size={16} />}</button>
            <span style={{ flex: 1, fontSize: 13.5, color: m.is_done ? 'var(--text-muted)' : 'var(--text-main)', textDecoration: m.is_done ? 'line-through' : 'none' }}>{m.title}</span>
            {m.due_date && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{fmtDate(m.due_date)}</span>}
            {canManage && <button onClick={() => onRemove(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
      {canManage && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Milestone…" style={{ ...field, flex: 2 }} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...field, flex: 1 }} />
          <button onClick={submit} disabled={!title.trim()} style={btn()}><Plus size={14} /></button>
        </div>
      )}
    </div>
  );
}

function AttachmentsPanel({ attachments, onUpload, onAddLink, onRemove, canManage }) {
  const [linkMode, setLinkMode] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Paperclip size={16} style={{ color: 'var(--primary)' }} /><h3 style={{ ...h3, margin: 0 }}>Attachments</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {attachments.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No files yet.</p>}
        {attachments.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <a href={a.url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13, color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</a>
            <button onClick={() => onRemove(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ ...btn(), cursor: 'pointer' }}>
          <Paperclip size={14} /> Upload image
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ''; }} />
        </label>
        <button onClick={() => setLinkMode((v) => !v)} style={btn()}><Link2 size={14} /> Add link</button>
      </div>
      {linkMode && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ ...field, flex: 1, minWidth: 100 }} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={{ ...field, flex: 2, minWidth: 140 }} />
          <button onClick={() => { if (name.trim() && url.trim()) { onAddLink(name.trim(), url.trim()); setName(''); setUrl(''); setLinkMode(false); } }} disabled={!name.trim() || !url.trim()} style={btn('var(--primary)', '#fff')}>Add</button>
        </div>
      )}
    </div>
  );
}

function ExtendModal({ current, onClose, onSave }) {
  const [date, setDate] = useState(current || '');
  const [reason, setReason] = useState('');
  return (
    <Overlay title="Extend / change deadline" onClose={onClose} footer={<><button onClick={onClose} style={btn()}>Cancel</button><button onClick={() => onSave(date, reason)} disabled={!date} style={btn('var(--primary)', '#fff')}><CalendarClock size={15} /> Save</button></>}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Current deadline: <strong>{fmtDate(current)}</strong>. Extending a completed project reopens it and restarts the 15-day chat-erase clock.</p>
      <label style={lbl}>New deadline *<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} /></label>
      <label style={lbl}>Reason<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...field, resize: 'vertical' }} placeholder="Why is the deadline changing?" /></label>
    </Overlay>
  );
}

function AddMemberModal({ members, existing, onClose, onSave }) {
  const [sel, setSel] = useState('');
  const available = members.filter((m) => !existing.includes(m.id));
  return (
    <Overlay title="Add a participant" onClose={onClose} footer={<><button onClick={onClose} style={btn()}>Cancel</button><button onClick={() => onSave(sel)} disabled={!sel} style={btn('var(--primary)', '#fff')}><Plus size={15} /> Add</button></>}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Add any person — including people outside the project’s departments.</p>
      <label style={lbl}>Member
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={field}>
          <option value="">— Select —</option>
          {available.map((m) => <option key={m.id} value={m.id}>{m.candidate_name}{(m.assigned_departments || []).length ? ` · ${(m.assigned_departments || []).join(', ')}` : ''}</option>)}
        </select>
      </label>
    </Overlay>
  );
}

function AddDepartmentModal({ members, onClose, onSave }) {
  const allDepts = Array.from(new Set(members.flatMap((m) => m.assigned_departments || []))).sort();
  const [sel, setSel] = useState({});
  const toggle = (d) => setSel((s) => { const n = { ...s }; if (n[d]) delete n[d]; else n[d] = true; return n; });
  const chosen = Object.keys(sel);
  return (
    <Overlay title="Add a whole department" onClose={onClose} footer={<><button onClick={onClose} style={btn()}>Cancel</button><button onClick={() => onSave(chosen)} disabled={!chosen.length} style={btn('var(--primary)', '#fff')}><Building2 size={15} /> Add {chosen.length || ''} dept(s)</button></>}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Every verified member of the selected department(s) becomes a participant.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {allDepts.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No departments found.</span>}
        {allDepts.map((d) => (
          <button key={d} onClick={() => toggle(d)} style={{ ...btn(sel[d] ? 'var(--primary)' : null, sel[d] ? '#fff' : null), fontSize: 12.5 }}>{d}</button>
        ))}
      </div>
    </Overlay>
  );
}
