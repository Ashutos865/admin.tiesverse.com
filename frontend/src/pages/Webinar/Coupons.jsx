import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Edit2,
  Pause,
  Play,
  Plus,
  Tags,
  TicketPercent,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  createCoupon,
  deleteCoupon,
  getCoupons,
  getEventRegistrations,
  getEvents,
  updateCoupon,
} from '../../apiClient';
import './Coupons.css';

const emptyForm = {
  code: '',
  target: '',
  discount_type: 'percent',
  discount_value: '',
  starts_at: '',
  expires_at: '',
  max_redemptions: '',
  active: true,
  is_test: false,
};

const slugify = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const displayDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const couponState = (coupon) => {
  // Shown ahead of everything else: handing a test code to a real registrant
  // means their seat is never recorded, so it has to be obvious at a glance.
  if (String(coupon.is_test) === '1') return { label: 'Test — not recorded', tone: 'scheduled' };
  if (String(coupon.active) !== '1') return { label: 'Paused', tone: 'paused' };
  const now = Date.now();
  const starts = coupon.starts_at ? new Date(coupon.starts_at).getTime() : null;
  const expires = coupon.expires_at ? new Date(coupon.expires_at).getTime() : null;
  if (starts && starts > now) return { label: 'Scheduled', tone: 'scheduled' };
  if (expires && expires <= now) return { label: 'Expired', tone: 'expired' };
  if (coupon.max_redemptions && Number(coupon.redeemed_count) >= Number(coupon.max_redemptions)) {
    return { label: 'Limit reached', tone: 'expired' };
  }
  return { label: 'Active', tone: 'active' };
};

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const showNotice = (message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const [couponData, eventData, webinarData] = await Promise.all([
      getCoupons(),
      getEvents(),
      getEventRegistrations(),
    ]);
    if (couponData?.error) {
      setNotice({ message: couponData.error, type: 'error' });
      setCoupons([]);
    } else {
      setCoupons(Array.isArray(couponData) ? couponData : []);
    }
    const paidEvents = (Array.isArray(eventData) ? eventData : [])
      .filter((item) => Number(item.price) > 0 && !item.past)
      .map((item) => ({
        key: `event::${slugify(item.title)}`,
        event_id: slugify(item.title),
        event_title: item.title,
        event_type: 'event',
        price: Number(item.price),
      }));
    const paidWebinars = (Array.isArray(webinarData) ? webinarData : [])
      .filter((item) => Number(item.price) > 0 && item.status !== 'past')
      .map((item) => ({
        key: `webinar::${slugify(item.title)}`,
        event_id: slugify(item.title),
        event_title: item.title,
        event_type: 'webinar',
        price: Number(item.price),
      }));
    setTargets([...paidEvents, ...paidWebinars]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const stats = useMemo(() => ({
    active: coupons.filter((item) => couponState(item).tone === 'active').length,
    scheduled: coupons.filter((item) => couponState(item).tone === 'scheduled').length,
    limited: coupons.filter((item) => item.max_redemptions).length,
    uses: coupons.reduce((sum, item) => sum + Number(item.redeemed_count || 0), 0),
  }), [coupons]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code || '',
      target: `${coupon.event_type}::${coupon.event_id}`,
      discount_type: coupon.discount_type || 'percent',
      discount_value: coupon.discount_value || '',
      starts_at: toLocalInput(coupon.starts_at),
      expires_at: toLocalInput(coupon.expires_at),
      max_redemptions: coupon.max_redemptions || '',
      active: String(coupon.active) === '1',
      // Without this, opening a test coupon and saving would quietly turn it
      // into a real one.
      is_test: String(coupon.is_test) === '1',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const submitCoupon = async (event) => {
    event.preventDefault();
    const target = targets.find((item) => item.key === form.target);
    if (!target) {
      showNotice('Choose a paid event or webinar.', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      ...target,
      code: form.code.trim().toUpperCase(),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : '',
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : '',
    };
    delete payload.target;
    delete payload.key;
    delete payload.price;
    const result = editingId
      ? await updateCoupon(editingId, payload)
      : await createCoupon(payload);
    setSaving(false);
    if (result?.error) {
      showNotice(result.error, 'error');
      return;
    }
    closeModal();
    showNotice(editingId ? 'Coupon updated.' : 'Coupon created.');
    loadData();
  };

  const toggleCoupon = async (coupon) => {
    const result = await updateCoupon(coupon.id, { active: String(coupon.active) !== '1' });
    if (result?.error) showNotice(result.error, 'error');
    else {
      showNotice(String(coupon.active) === '1' ? 'Coupon paused.' : 'Coupon resumed.');
      loadData();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const result = await deleteCoupon(deleteTarget.id);
    setSaving(false);
    if (result?.error) showNotice(result.error, 'error');
    else {
      setDeleteTarget(null);
      showNotice('Coupon deleted.');
      loadData();
    }
  };

  return (
    <div className="coupons-page">
      <header className="coupons-header">
        <div>
          <span className="coupons-eyebrow">Revenue operations</span>
          <h1>Coupon Codes</h1>
          <p>Create event-specific offers, schedule availability, limit the first registrations, or pause a coupon instantly.</p>
        </div>
        <button type="button" className="coupons-create" onClick={openCreate} disabled={!targets.length}>
          <Plus size={18} /> Create Coupon
        </button>
      </header>

      {notice && <div className={`coupons-notice is-${notice.type}`}>{notice.message}</div>}
      {!loading && targets.length === 0 && (
        <div className="coupons-warning">Create a paid event or set a webinar/workshop price above ₹0 before creating coupons.</div>
      )}

      <section className="coupon-metrics" aria-label="Coupon totals">
        <article><span><TicketPercent size={20} /></span><div><small>Active coupons</small><strong>{stats.active}</strong></div></article>
        <article><span><CalendarClock size={20} /></span><div><small>Scheduled</small><strong>{stats.scheduled}</strong></div></article>
        <article><span><Users size={20} /></span><div><small>Registration-limited</small><strong>{stats.limited}</strong></div></article>
        <article><span><Tags size={20} /></span><div><small>Reserved / redeemed</small><strong>{stats.uses}</strong></div></article>
      </section>

      {loading ? (
        <div className="coupon-empty"><TicketPercent size={34} /><p>Loading coupon rules…</p></div>
      ) : coupons.length === 0 ? (
        <div className="coupon-empty">
          <TicketPercent size={38} />
          <strong>No coupon codes yet</strong>
          <p>Create the first offer for one of your paid events or webinars.</p>
        </div>
      ) : (
        <section className="coupon-grid">
          {coupons.map((coupon) => {
            const state = couponState(coupon);
            const max = coupon.max_redemptions ? Number(coupon.max_redemptions) : null;
            const used = Number(coupon.redeemed_count || 0);
            const percent = max ? Math.min((used / max) * 100, 100) : 0;
            return (
              <article className="coupon-card" key={coupon.id}>
                <div className="coupon-card-top">
                  <div><small>Coupon code</small><strong>{coupon.code}</strong></div>
                  <span className={`coupon-state is-${state.tone}`}>{state.label}</span>
                </div>
                <div className="coupon-discount">
                  <strong>{coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `₹${Number(coupon.discount_value).toLocaleString('en-IN')}`}</strong>
                  <span>off</span>
                </div>
                <div className="coupon-target">
                  <span>{coupon.event_type}</span>
                  <strong>{coupon.event_title}</strong>
                </div>
                <div className="coupon-schedule">
                  <p><CalendarClock size={16} />{coupon.starts_at ? `Starts ${displayDate(coupon.starts_at)}` : 'Starts immediately'}</p>
                  <p><CalendarClock size={16} />{coupon.expires_at ? `Ends ${displayDate(coupon.expires_at)}` : 'No expiry date'}</p>
                </div>
                <div className="coupon-usage">
                  <div><span>Registrations used</span><strong>{used}{max ? ` / ${max}` : ' / Unlimited'}</strong></div>
                  {max && <div className="coupon-progress"><span style={{ width: `${percent}%` }} /></div>}
                </div>
                <footer>
                  <button type="button" className="coupon-toggle" onClick={() => toggleCoupon(coupon)}>
                    {String(coupon.active) === '1' ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Resume</>}
                  </button>
                  <div>
                    <button type="button" onClick={() => openEdit(coupon)} aria-label={`Edit ${coupon.code}`}><Edit2 size={17} /></button>
                    <button type="button" className="is-danger" onClick={() => setDeleteTarget(coupon)} aria-label={`Delete ${coupon.code}`}><Trash2 size={17} /></button>
                  </div>
                </footer>
              </article>
            );
          })}
        </section>
      )}

      {modalOpen && (
        <div className="app-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <section className="app-modal coupon-form-modal" role="dialog" aria-modal="true" aria-labelledby="coupon-modal-title">
            <header className="app-modal-header">
              <div><span><TicketPercent size={20} /></span><div><small>Coupon management</small><h2 id="coupon-modal-title">{editingId ? 'Edit Coupon' : 'Create Coupon'}</h2></div></div>
              <button type="button" className="app-modal-close" onClick={closeModal} aria-label="Close coupon form"><X size={18} /></button>
            </header>
            <form onSubmit={submitCoupon}>
              <div className="app-modal-body coupon-form-body">
                <label className="app-field"><span>Coupon code</span><input value={form.code} onChange={(event) => setForm((value) => ({ ...value, code: event.target.value.toUpperCase() }))} placeholder="EARLY10" required /></label>
                <label className="app-field"><span>Paid event or webinar</span><select value={form.target} onChange={(event) => setForm((value) => ({ ...value, target: event.target.value }))} required><option value="">Select a target</option>{targets.map((target) => <option value={target.key} key={target.key}>{target.event_type === 'webinar' ? 'Webinar' : 'Event'} · {target.event_title} · ₹{target.price.toLocaleString('en-IN')}</option>)}</select></label>
                <div className="coupon-form-grid">
                  <label className="app-field"><span>Discount type</span><select value={form.discount_type} onChange={(event) => setForm((value) => ({ ...value, discount_type: event.target.value }))}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label>
                  <label className="app-field"><span>{form.discount_type === 'percent' ? 'Discount percentage' : 'Discount amount (₹)'}</span><input type="number" min="0.01" max={form.discount_type === 'percent' ? '100' : undefined} step="0.01" value={form.discount_value} onChange={(event) => setForm((value) => ({ ...value, discount_value: event.target.value }))} required /></label>
                </div>
                <div className="coupon-form-grid">
                  <label className="app-field"><span>Starts at (optional)</span><input type="datetime-local" value={form.starts_at} onChange={(event) => setForm((value) => ({ ...value, starts_at: event.target.value }))} /></label>
                  <label className="app-field"><span>Expires at (optional)</span><input type="datetime-local" value={form.expires_at} onChange={(event) => setForm((value) => ({ ...value, expires_at: event.target.value }))} /></label>
                </div>
                <label className="app-field"><span>First registrations limit (optional)</span><input type="number" min="1" value={form.max_redemptions} onChange={(event) => setForm((value) => ({ ...value, max_redemptions: event.target.value }))} placeholder="10 — leave empty for unlimited" /></label>
                <label className="app-switch"><input type="checkbox" checked={form.active} onChange={(event) => setForm((value) => ({ ...value, active: event.target.checked }))} /><span><strong>Coupon enabled</strong><small>Turn this off to save it as paused.</small></span></label>
                <label className="app-switch"><input type="checkbox" checked={form.is_test} onChange={(event) => setForm((value) => ({ ...value, is_test: event.target.checked }))} /><span><strong>Test coupon</strong><small>Runs a real registration — the confirmation email, the joining link and the ticket all go out — but nothing is saved, so it never reaches your attendee numbers. Must be 100% off.</small></span></label>
              </div>
              <footer className="app-modal-footer"><button type="button" onClick={closeModal}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update Coupon' : 'Create Coupon'}</button></footer>
            </form>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="app-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
          <section className="app-modal app-confirm-modal" role="alertdialog" aria-modal="true">
            <div className="app-confirm-icon is-danger"><Trash2 size={23} /></div>
            <h2>Delete coupon?</h2>
            <p>Remove <strong>{deleteTarget.code}</strong>? Existing registrations keep their recorded discount.</p>
            <footer className="app-modal-footer"><button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="is-danger" onClick={confirmDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete Coupon'}</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
