import { useState, useEffect, useRef, useCallback } from 'react';
import { getMessages, sendMessage, deleteMessage, pinMessage, getDMs, sendDM, getMe, getDmPeople } from '../../apiClient';
import { Send, Loader2, Pin, Trash2, AtSign, MessageSquare, ArrowLeft, Hash } from 'lucide-react';

const field = { padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--outline-variant)', color: 'var(--text-main)', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', resize: 'none' };
const fmtTime = (d) => {
  const t = d ? new Date(d) : null;
  return t && !isNaN(t.getTime()) ? t.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};

// Highlight @Name mentions inside a message body.
function renderBody(text, mentionNames) {
  if (!mentionNames?.length) return text;
  const names = mentionNames.map((m) => m.name);
  const re = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = String(text).split(re);
  return parts.map((p, i) => (names.includes(p) ? <strong key={i} style={{ color: 'var(--primary)' }}>@{p}</strong> : p));
}

export default function ProjectChat({ projectId, participants, teams = [], canManage, onError }) {
  const [mode, setMode] = useState('group');      // 'group' | 'team' | 'dm'
  const [teamChan, setTeamChan] = useState(null); // sub-team id when mode==='team'
  const [dmWith, setDmWith] = useState(null);     // identity key ("m5"/"u3") for DM
  const [messages, setMessages] = useState([]);
  const [dms, setDms] = useState([]);
  const [dmPeople, setDmPeople] = useState([]);   // [{key,name,kind}]
  const [text, setText] = useState('');
  const [meId, setMeId] = useState(null);
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [picked, setPicked] = useState([]);        // mentioned member ids
  const endRef = useRef(null);
  const lastMsgId = useRef(0);
  const lastDmId = useRef(0);
  const notify = onError || (() => {});

  useEffect(() => {
    getMe().then((m) => setMeId(m?.member?.id || null)).catch(() => {});
    getDmPeople(projectId).then((r) => setDmPeople(r?.people || [])).catch(() => {});
  }, [projectId]);

  // Sub-team channels the current user can see: managers see all, else their own teams.
  const myTeamIds = (participants.find((p) => p.member === meId)?.teams) || [];
  const channels = canManage ? teams : teams.filter((t) => myTeamIds.includes(t.id));

  const scrollDown = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

  // ── message polling (group when teamId=null, else the sub-team channel) ──
  const pollMessages = useCallback(async (teamId) => {
    const rows = await getMessages(projectId, lastMsgId.current, teamId);
    if (Array.isArray(rows) && rows.length) {
      lastMsgId.current = rows[rows.length - 1].id;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      scrollDown();
    }
  }, [projectId]);

  const pollDm = useCallback(async () => {
    if (!dmWith) return;
    const rows = await getDMs(projectId, dmWith, lastDmId.current);
    if (Array.isArray(rows) && rows.length) {
      lastDmId.current = rows[rows.length - 1].id;
      setDms((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      scrollDown();
    }
  }, [projectId, dmWith]);

  // reset + initial load when switching channel/conversation
  useEffect(() => {
    if (mode === 'group') { setMessages([]); lastMsgId.current = 0; pollMessages(null); }
    else if (mode === 'team' && teamChan) { setMessages([]); lastMsgId.current = 0; pollMessages(teamChan); }
  }, [mode, teamChan, pollMessages]);
  useEffect(() => {
    if (mode === 'dm' && dmWith) { setDms([]); lastDmId.current = 0; pollDm(); }
  }, [mode, dmWith, pollDm]);

  // poll every 4s while open
  useEffect(() => {
    const t = setInterval(() => {
      if (mode === 'group') pollMessages(null);
      else if (mode === 'team') pollMessages(teamChan);
      else pollDm();
    }, 4000);
    return () => clearInterval(t);
  }, [mode, teamChan, pollMessages, pollDm]);

  // ── @mention handling ──
  const onType = (v) => {
    setText(v);
    const m = v.match(/@(\w*)$/);
    if (m) { setMentionOpen(true); setMentionQuery(m[1].toLowerCase()); }
    else setMentionOpen(false);
  };
  const addMention = (p) => {
    setText((t) => t.replace(/@(\w*)$/, `@${p.candidate_name} `));
    setPicked((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]));
    setMentionOpen(false);
  };
  const mentionOptions = participants
    .filter((p) => p.member_name?.toLowerCase().includes(mentionQuery))
    .slice(0, 6);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (mode === 'dm' && !dmWith) return;
    setSending(true);
    try {
      if (mode === 'group' || mode === 'team') {
        // keep only mentions whose name is still present in the text
        const active = picked.filter((id) => {
          const p = participants.find((x) => x.member === id || x.id === id);
          const name = p?.member_name;
          return name && body.includes(`@${name}`);
        });
        const payload = { project: projectId, body, mentions: active };
        if (mode === 'team') payload.team = teamChan;
        const msg = await sendMessage(payload);
        if (msg && msg.id) {
          setMessages((prev) => [...prev, msg]); lastMsgId.current = Math.max(lastMsgId.current, msg.id);
          setText(''); setPicked([]); scrollDown();
        } else { notify(msg?.error || msg?.detail || 'Message could not be sent.'); }
      } else {
        const dm = await sendDM({ project: projectId, recipient: dmWith, body });
        if (dm && dm.id) {
          setDms((prev) => [...prev, dm]); lastDmId.current = Math.max(lastDmId.current, dm.id);
          setText(''); scrollDown();
        } else { notify(dm?.error || dm?.detail || 'Message could not be sent.'); }
      }
    } catch (e) { notify(e.message || 'Message could not be sent.'); }
    setSending(false);
  };

  const pinned = messages.filter((m) => m.pinned);
  const dmPartner = dmPeople.find((p) => p.key === dmWith);
  const teamName = teams.find((t) => t.id === teamChan)?.name;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 0, border: '1px solid var(--outline-variant)', borderRadius: 12, overflow: 'hidden', height: 560 }}>
      {/* sidebar: group + people for DM */}
      <div style={{ borderRight: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', overflowY: 'auto' }}>
        <button onClick={() => { setMode('group'); setDmWith(null); }} style={{ ...sideBtn, background: mode === 'group' ? 'var(--surface)' : 'transparent', fontWeight: mode === 'group' ? 700 : 500 }}>
          <MessageSquare size={15} /> Group chat
        </button>
        {channels.length > 0 && (
          <>
            <div style={{ padding: '10px 14px 4px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Sub-team channels</div>
            {channels.map((t) => (
              <button key={t.id} onClick={() => { setMode('team'); setTeamChan(t.id); setDmWith(null); }} style={{ ...sideBtn, background: mode === 'team' && teamChan === t.id ? 'var(--surface)' : 'transparent' }}>
                <Hash size={14} style={{ color: '#7c3aed', flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              </button>
            ))}
          </>
        )}
        <div style={{ padding: '10px 14px 4px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Direct messages</div>
        {dmPeople.map((p) => (
          <button key={p.key} onClick={() => { setMode('dm'); setDmWith(p.key); }} style={{ ...sideBtn, background: mode === 'dm' && dmWith === p.key ? 'var(--surface)' : 'transparent' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: p.kind === 'admin' ? '#7c3aed' : 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{(p.name || '?').slice(0, 1).toUpperCase()}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}{p.kind === 'admin' ? ' ·admin' : ''}</span>
          </button>
        ))}
      </div>

      {/* conversation */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--outline-variant)', fontSize: 14, fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {mode === 'dm' && <button onClick={() => setMode('group')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><ArrowLeft size={16} /></button>}
          {mode === 'group' ? 'Group chat' : mode === 'team' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Hash size={15} style={{ color: '#7c3aed' }} />{teamName || 'Sub-team'} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>· private to this team</span></span> : `Chat with ${dmPartner?.name || ''}`}
        </div>

        {(mode === 'group' || mode === 'team') && pinned.length > 0 && (
          <div style={{ padding: '8px 16px', background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)' }}>
            {pinned.map((m) => <div key={m.id} style={{ fontSize: 12, color: 'var(--text-muted)' }}><Pin size={11} style={{ verticalAlign: -1 }} /> <strong>{m.sender_name}:</strong> {m.body}</div>)}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)' }}>
          {(mode === 'dm' ? dms : messages).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, margin: 'auto' }}>No messages yet. Say hi 👋</div>}
          {(mode === 'dm' ? dms : messages).map((m) => {
            const mine = mode === 'dm' ? m.is_mine : (m.sender === meId);
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '78%', background: mine ? 'var(--primary)' : 'var(--surface-container-low)', color: mine ? '#fff' : 'var(--text-main)', border: mine ? 'none' : '1px solid var(--outline-variant)', borderRadius: 12, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {!mine && mode !== 'dm' && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', marginBottom: 2 }}>{m.sender_name}</div>}
                  <div>{renderBody(m.body, m.mention_names)}</div>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                  {fmtTime(m.created_at)}
                  {mode !== 'dm' && canManage && <button onClick={async () => { await pinMessage(m.id, !m.pinned); setMessages((ms) => ms.map((x) => x.id === m.id ? { ...x, pinned: !x.pinned } : x)); }} title="Pin" style={iconBtn}><Pin size={11} /></button>}
                  {mode !== 'dm' && (mine || canManage) && <button onClick={async () => { await deleteMessage(m.id); setMessages((ms) => ms.filter((x) => x.id !== m.id)); }} title="Delete" style={iconBtn}><Trash2 size={11} /></button>}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* composer */}
        <div style={{ borderTop: '1px solid var(--outline-variant)', padding: 12, position: 'relative' }}>
          {mentionOpen && mode !== 'dm' && mentionOptions.length > 0 && (
            <div style={{ position: 'absolute', bottom: 60, left: 12, background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 200, zIndex: 10, overflow: 'hidden' }}>
              {mentionOptions.map((p) => (
                <button key={p.id} onClick={() => addMention({ id: p.member || p.id, candidate_name: p.member_name })} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-main)', textAlign: 'left' }}>
                  <AtSign size={13} style={{ color: 'var(--primary)' }} /> {p.member_name}
                </button>
              ))}
            </div>
          )}
          {mode === 'dm' && !dmWith ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>Pick someone on the left to start a direct message.</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea rows={1} value={text} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={mode === 'dm' ? 'Write a message…' : 'Message… use @ to mention'} style={{ ...field, maxHeight: 120 }} />
              <button onClick={send} disabled={sending || !text.trim()} style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>{sending ? <Loader2 size={16} className="ma-spin" /> : <Send size={16} />}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const sideBtn = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-main)', textAlign: 'left' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'inline-flex' };
