import { useEffect, useState, useCallback } from 'react';
import { getTechnicalStats } from '../../apiClient';
import { Server, Mail, Image as ImageIcon, HardDrive, Database, Cpu, RefreshCw, CheckCircle2, AlertTriangle, IndianRupee } from 'lucide-react';

const fmtBytes = (n) => {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString());
const fmtDur = (s) => {
  if (s == null) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
const OK = '#16a34a', WARN = '#f59e0b', BAD = '#ef4444';
const barColor = (pct) => (pct >= 90 ? BAD : pct >= 70 ? WARN : OK);
const tint = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

function Bar({ label, used, total, pct, unit = 'bytes', hint }) {
  const p = pct != null ? pct : (total ? Math.min(100, (used / total) * 100) : 0);
  const fmt = unit === 'bytes' ? fmtBytes : fmtNum;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--text-main)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(used)}{total != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> / {fmt(total)}</span> : null}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-container-high)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: barColor(p), borderRadius: 999, transition: 'width .3s' }} />
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ flex: '1 1 88px', minWidth: 84 }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.85 }}>{sub}</div>}
    </div>
  );
}

function Card({ icon: Icon, title, subtitle, error, price, children }) {
  return (
    <div className="card" style={{ padding: '1.25rem 1.35rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 15 }}>
        <span style={iconBox}><Icon size={18} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-main)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {error
          ? <div style={{ fontSize: 12.5, color: WARN, background: tint(WARN, 12), border: `1px solid ${tint(WARN, 30)}`, borderRadius: 8, padding: '8px 10px' }}>Could not load: {error}</div>
          : children}
      </div>
      {price && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-muted)' }}>
          <IndianRupee size={13} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
          <span><strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>After free tier: </strong>{price}</span>
        </div>
      )}
    </div>
  );
}

function Badge({ ok, children }) {
  const c = ok ? OK : WARN;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: tint(c, 16), color: c }}>
      {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}{children}
    </span>
  );
}

export default function TechnicalDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async (fresh) => {
    setLoading(true); setErr('');
    const res = await getTechnicalStats(fresh).catch(() => ({ error: 'Failed' }));
    if (res?.error) setErr(res.error); else setData(res);
    setLoading(false);
  }, []);
  useEffect(() => { load(false); }, [load]);

  if (loading && !data) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading infrastructure stats…</div>;
  if (err && !data) return <div style={{ padding: 32, color: BAD }}>{err === 'Developer access only.' ? 'This page is for the developer account only.' : err}</div>;

  const d = data || {};
  const server = d.server || {}, ses = d.ses || {}, cld = d.cloudinary || {}, r2 = d.r2 || {}, turso = d.turso || {}, d1 = d.d1 || {};

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Technical / Infrastructure</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Live usage, free-tier limits, and post-free-tier cost. Prices in INR (~₹84/$, official docs). Developer-only.</p>
        </div>
        <button onClick={() => load(true)} className="btn" style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)' }} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'tech-spin' : ''} />{loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div style={grid}>
        <Card icon={Server} title="Server (VPS)" subtitle={`Hostinger KVM · ${server.cpu_cores || '—'} vCPU`} error={server.error}
          price="Fixed plan — KVM 2 ≈ ₹755/mo at renewal ($8.99); promo terms from ~₹587/mo. Not usage-billed.">

          <Bar label="RAM" used={server.mem_used} total={server.mem_total} pct={server.mem_pct} />
          <Bar label="Disk" used={server.disk_used} total={server.disk_total} pct={server.disk_pct} />
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <Stat label="Load (1m)" value={server.load_avg ? server.load_avg[0].toFixed(2) : '—'} sub={server.load_avg ? `5m ${server.load_avg[1].toFixed(2)}` : ''} />
            <Stat label="CPU cores" value={server.cpu_cores ?? '—'} />
            <Stat label="Uptime" value={fmtDur(server.uptime_sec)} />
          </div>
        </Card>

        <Card icon={Mail} title="Email (AWS SES)" subtitle={ses.region} error={ses.error}
          price="₹8.4 per 1,000 emails (+₹10/GB attachments). Free: 3,000 emails/mo for first 12 months.">

          <div style={{ marginBottom: 10 }}>
            <Badge ok={!ses.sandbox}>{ses.sandbox ? 'Sandbox mode' : 'Production'}</Badge>
          </div>
          <Bar label="Sent today" used={ses.sent_24h} total={ses.max_24h} unit="num" hint={`${fmtNum(ses.remaining_24h)} remaining · ${ses.max_send_rate ?? '—'}/sec max rate`} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            <strong style={{ color: 'var(--text-main)' }}>Verified senders ({(ses.identities || []).length}):</strong> {(ses.identities || []).join(', ') || '—'}
          </div>
          {ses.recent && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              <Stat label="Sent (2wk)" value={fmtNum(ses.recent.DeliveryAttempts)} />
              <Stat label="Bounces" value={fmtNum(ses.recent.Bounces)} />
              <Stat label="Complaints" value={fmtNum(ses.recent.Complaints)} />
            </div>
          )}
        </Card>

        <Card icon={ImageIcon} title="Cloudinary (photos)" subtitle={`${cld.plan || ''} plan`} error={cld.error}
          price="Free = 25 credits/mo. Next: Plus ≈ ₹8,316/mo ($99) for 225 credits (₹7,476/mo if billed yearly).">

          <Bar label="Monthly credits" used={cld.credits_used} total={cld.credits_limit} unit="num" pct={cld.credits_pct}
               hint="1 credit = 1GB storage OR 1GB bandwidth OR 1k transforms" />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
            <Stat label="Images stored" value={fmtNum(cld.images)} sub={cld.derived != null ? `+${fmtNum(cld.derived)} derived` : ''} />
            <Stat label="Storage" value={fmtBytes(cld.storage_bytes)} />
            <Stat label="Bandwidth (mo)" value={fmtBytes(cld.bandwidth_bytes)} />
            <Stat label="Transforms" value={fmtNum(cld.transformations)} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, opacity: 0.85 }}>Max upload: {fmtBytes(cld.max_image_bytes)} · updated {cld.last_updated || '—'}</div>
        </Card>

        <Card icon={HardDrive} title="Cloudflare R2 (files)" subtitle={r2.bucket} error={r2.error}
          price="₹1.26/GB-month storage · ops ₹378/million (writes), ₹30/million (reads) · egress free.">

          <Bar label="Storage" used={r2.bytes} total={r2.free_bytes} hint="10 GB free tier" />
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <Stat label="Objects" value={fmtNum(r2.objects)} sub="resumes + docs" />
            <Stat label="Used" value={fmtBytes(r2.bytes)} />
          </div>
        </Card>

        <Card icon={Database} title="Turso (webinars DB)" subtitle="5 GB free tier"
          price="Free = 5 GB · 500M reads/mo · 100 DBs. Next: Developer ≈ ₹419/mo ($4.99, 9 GB, 2.5B reads); overage ₹63/GB, ₹84 per billion reads."
          error={turso.error}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat label="Registrations" value={fmtNum(turso.registrations)} />
            <Stat label="Certificates" value={fmtNum(turso.certificate_records)} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12, opacity: 0.85 }}>Free: 5 GB storage · 500M row reads/mo · 100 databases</div>
        </Card>

        <Card icon={Cpu} title="Cloudflare D1 (candidates)" subtitle="5 GB free tier"
          price="₹63/GB-month storage · writes ₹84/million rows · reads ₹0.08/million rows (Workers Paid plan)."
          error={d1.error}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Stat label="Candidates" value={fmtNum(d1.candidates)} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12, opacity: 0.85 }}>Free: 5 GB storage · 5M rows read/day · 100k writes/day</div>
        </Card>
      </div>

      <style>{`@keyframes tech-spin{to{transform:rotate(360deg)}}.tech-spin{animation:tech-spin 1s linear infinite}`}</style>
    </div>
  );
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16, alignItems: 'start' };
const iconBox = { display: 'inline-flex', width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)', flexShrink: 0 };
