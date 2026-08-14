import { useState } from 'react';
import { ExternalLink, RefreshCw, Sheet, Unlink } from 'lucide-react';
import { connectFormSheet, syncFormSheet, disconnectFormSheet } from '../../apiClient';

/**
 * Mirror this form's responses into a Google Sheet.
 *
 * The sheet is a copy, not the record: responses stay in the database, and the
 * tab is rewritten in full on every sync so a renamed question renames its
 * column instead of quietly writing under the old one. Disconnecting leaves
 * the spreadsheet alone.
 */

const box = { border: '1px solid var(--outline-variant,#e5e7eb)', borderRadius: 12, padding: 16, background: 'var(--surface,#fff)' };
const input = { width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--outline-variant,#e5e7eb)', background: 'var(--surface,#fff)', color: 'var(--text-main,#111)', fontSize: 13, fontFamily: 'inherit', outline: 'none' };
const btn = (solid) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
    border: solid ? 'none' : '1px solid var(--outline-variant,#e5e7eb)',
    background: solid ? '#0d0d0d' : 'transparent',
    color: solid ? '#fff' : 'var(--text-main,#111)',
    fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
});

export default function FormSheetPanel({ formId, sheetUrl, onChanged }) {
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');
    const [existing, setExisting] = useState('');
    const [showLink, setShowLink] = useState(false);

    const run = async (what, fn) => {
        setBusy(what); setMsg(''); setErr('');
        const res = await fn().catch(() => ({ error: 'Network error.' }));
        setBusy('');
        if (res?.error) { setErr(res.error); return null; }
        if (res?.warning) setErr(res.warning);
        return res;
    };

    const create = () => run('create', () => connectFormSheet(formId, {})).then((res) => {
        if (res?.sheet_url) { setMsg(`Spreadsheet created. ${res.synced} response${res.synced === 1 ? '' : 's'} written.`); onChanged?.(); }
    });

    const adopt = () => {
        if (!existing.trim()) { setErr('Paste the spreadsheet link first.'); return; }
        run('adopt', () => connectFormSheet(formId, { sheet_url: existing.trim() })).then((res) => {
            if (res?.sheet_url) { setMsg(`Connected. ${res.synced} response${res.synced === 1 ? '' : 's'} written.`); setExisting(''); setShowLink(false); onChanged?.(); }
        });
    };

    const sync = () => run('sync', () => syncFormSheet(formId)).then((res) => {
        if (res) setMsg(`Synced ${res.synced} response${res.synced === 1 ? '' : 's'}.`);
    });

    const disconnect = () => {
        if (!window.confirm('Stop mirroring to this spreadsheet? The sheet itself is not deleted.')) return;
        run('disconnect', () => disconnectFormSheet(formId)).then((res) => {
            if (res?.ok) { setMsg('Disconnected. The spreadsheet was left as it is.'); onChanged?.(); }
        });
    };

    return (
        <div style={box}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--text-main,#111)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Sheet size={15} /> Google Sheets
            </h3>

            {sheetUrl ? (
                <>
                    <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted,#6b7280)', lineHeight: 1.5 }}>
                        Responses are mirrored here, and the sheet updates as they arrive.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <a href={sheetUrl} target="_blank" rel="noreferrer" style={{ ...btn(true), textDecoration: 'none' }}>
                            <ExternalLink size={14} /> Open spreadsheet
                        </a>
                        <button type="button" style={btn(false)} disabled={busy === 'sync'} onClick={sync}>
                            <RefreshCw size={14} /> {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                        </button>
                        <button type="button" style={{ ...btn(false), color: '#dc2626', borderColor: '#dc2626' }} disabled={busy === 'disconnect'} onClick={disconnect}>
                            <Unlink size={14} /> Disconnect
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted,#6b7280)', lineHeight: 1.5 }}>
                        Keep a live copy of every response in a spreadsheet. Create a new one, or
                        connect a sheet you already have.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" style={btn(true)} disabled={busy === 'create'} onClick={create}>
                            <Sheet size={14} /> {busy === 'create' ? 'Creating…' : 'Create a spreadsheet'}
                        </button>
                        <button type="button" style={btn(false)} onClick={() => setShowLink((v) => !v)}>
                            Use an existing one
                        </button>
                    </div>
                    {showLink && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            <input style={{ ...input, flex: 1, minWidth: 240 }} value={existing}
                                onChange={(e) => setExisting(e.target.value)}
                                placeholder="https://docs.google.com/spreadsheets/d/…" />
                            <button type="button" style={btn(true)} disabled={busy === 'adopt'} onClick={adopt}>
                                {busy === 'adopt' ? 'Connecting…' : 'Connect'}
                            </button>
                            <p style={{ margin: 0, flexBasis: '100%', fontSize: 11.5, color: 'var(--text-muted,#6b7280)' }}>
                                The Tiesverse Google account needs edit access to that sheet.
                            </p>
                        </div>
                    )}
                </>
            )}

            {msg && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#047857', fontWeight: 600 }}>{msg}</p>}
            {err && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#b91c1c', lineHeight: 1.5 }}>{err}</p>}
        </div>
    );
}
