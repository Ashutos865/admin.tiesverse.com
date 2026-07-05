import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Mail,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react';
import {
  downloadCertificateAsset,
  downloadCertificateRecordsCsv,
  emailCertificateBatch,
  generateCertificate,
  generateCertificateBatch,
  getCertificateImportRows,
  getCertificateSources,
  getCertificateTemplate,
  importCertificateRecords,
  markCertificateRecordsEmailed,
} from './certificateApi';
import { readCsvHeaders } from './certificateUtils';
import './Certificates.css';

const defaultMailTemplate = {
  email_column: 'email',
  name_column: 'participant_name',
  html_mode: false,
  custom_html: '<div style="font-family:Arial;padding:32px"><h1>Congratulations, {{participant_name}}!</h1><p>Your certificate is attached.</p></div>',
  subject: 'Your certificate is ready, {{participant_name}}',
  preheader: 'Your certificate PDF is attached.',
  title: 'Congratulations, {{participant_name}}!',
  greeting: 'Hi {{participant_name}},',
  body: 'Thank you for participating. Your personalized certificate is attached.',
  button_text: 'Certificate attached',
  footer: 'This email was generated automatically.',
  sender_name: 'Tiesverse Certificates',
  reply_to: '',
  primary_color: '#3525cd',
  background_color: '#f2f4f6',
  card_color: '#ffffff',
  text_color: '#191c1e',
  font_family: 'Arial, sans-serif',
  attachment_filename: 'certificate-{{participant_name}}.pdf',
};

const CertificateGenerate = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const presetEventKey = location.state?.event_key || '';
  const [template, setTemplate] = useState(null);
  const [mode, setMode] = useState('single');
  const [values, setValues] = useState({});
  const [csvFile, setCsvFile] = useState(null);
  const [mailFile, setMailFile] = useState(null);
  const [mailHeaders, setMailHeaders] = useState([]);
  const [mailTemplate, setMailTemplate] = useState(defaultMailTemplate);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [sources, setSources] = useState({ webinar_events: [], offer_letters: { total: 0, pending: 0 } });
  const [sourceType, setSourceType] = useState('webinar');
  const [eventKey, setEventKey] = useState(presetEventKey);
  const [sourceRows, setSourceRows] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);

  useEffect(() => {
    getCertificateTemplate(id)
      .then((data) => {
        setTemplate(data);
        setValues(Object.fromEntries((data.variables || []).map((variable) => [
          variable.name,
          variable.default_value || variable.sample_value || '',
        ])));
        const emailVariable = data.variables?.find((variable) => variable.name.includes('email'));
        const nameVariable = data.variables?.find((variable) => variable.name.includes('name'));
        setMailTemplate((current) => ({
          ...current,
          email_column: emailVariable?.name || current.email_column,
          name_column: nameVariable?.name || current.name_column,
        }));
      })
      .catch((caught) => setError(caught?.message || 'Could not load generation form.'));
  }, [id]);

  useEffect(() => {
    getCertificateSources(id)
      .then((data) => {
        setSources(data);
        const firstEvent = data.webinar_events?.[0]?.event_key || '';
        setEventKey((current) => current || presetEventKey || firstEvent);
      })
      .catch(() => {});
  }, [id]);

  const manualVariables = useMemo(
    () => (template?.variables || []).filter((variable) => !variable.generator_enabled),
    [template],
  );
  const selectedEvent = sources.webinar_events?.find((event) => event.event_key === eventKey);

  const loadSourceRows = async () => {
    setSourceLoading(true);
    setError('');
    try {
      const payload = await getCertificateImportRows({
        templateId: id,
        sourceType,
        eventKey: sourceType === 'webinar' ? eventKey : '',
        pendingOnly: true,
      });
      setSourceRows(payload.rows || []);
    } catch (caught) {
      setError(caught?.message || 'Could not load pending source rows.');
      setSourceRows([]);
    } finally {
      setSourceLoading(false);
    }
  };

  const importPendingRecords = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const imported = await importCertificateRecords({
        template_id: id,
        template_name: template.name,
        source_type: sourceType,
        event_key: sourceType === 'webinar' ? eventKey : '',
      });
      setResult({ type: 'import', sourceType, ...imported });
      await loadSourceRows();
      getCertificateSources(id).then(setSources).catch(() => {});
    } catch (caught) {
      setError(caught?.message || 'Could not import certificate records.');
    } finally {
      setBusy(false);
    }
  };

  const recordsToCsvFile = (records) => {
    const headers = [...new Set(records.flatMap((record) => Object.keys(record.data || {})))];
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      headers.join(','),
      ...records.map((record) => headers.map((header) => escape(record.data?.[header])).join(',')),
    ].join('\n');
    return new File([csv], 'certificate-import.csv', { type: 'text/csv' });
  };

  const importAndEmailPending = async () => {
    setBusy(true);
    setProgress(2);
    setError('');
    setResult(null);
    try {
      const imported = await importCertificateRecords({
        template_id: id,
        template_name: template.name,
        source_type: sourceType,
        event_key: sourceType === 'webinar' ? eventKey : '',
      });
      if (!imported.created?.length) {
        setResult({ type: 'import', sourceType, ...imported });
        return;
      }
      const file = recordsToCsvFile(imported.created);
      const mailed = await emailCertificateBatch(id, file, mailTemplate, setProgress);
      await markCertificateRecordsEmailed(imported.created.map((record) => record.id), mailed.sent > 0 ? 'sent' : 'failed');
      setResult({ type: 'email', ...mailed, imported_count: imported.created_count });
      setProgress(100);
      await loadSourceRows();
      getCertificateSources(id).then(setSources).catch(() => {});
    } catch (caught) {
      setError(caught?.message || 'Could not import and email certificates.');
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const downloadImportedCsv = async () => {
    if (!sourceRows.length) await loadSourceRows();
    const imported = await importCertificateRecords({
      template_id: id,
      template_name: template.name,
      source_type: sourceType,
      event_key: sourceType === 'webinar' ? eventKey : '',
    });
    if (!imported.created?.length) {
      setResult({ type: 'import', sourceType, ...imported });
      return;
    }
    const blob = await downloadCertificateRecordsCsv(imported.created.map((record) => record.id));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${template.name.replace(/\s+/g, '-').toLowerCase()}-imported-records.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setResult({ type: 'import', sourceType, ...imported });
  };

  const runSingle = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const generated = await generateCertificate(id, values);
      setResult({ type: 'single', ...generated });
    } catch (caught) {
      setError(caught?.message || 'Certificate generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const runBatch = async () => {
    if (!csvFile) return;
    setBusy(true);
    setProgress(2);
    setError('');
    setResult(null);
    try {
      const generated = await generateCertificateBatch(id, csvFile, setProgress);
      setResult({ type: 'batch', ...generated });
      setProgress(100);
    } catch (caught) {
      setError(caught?.message || 'Batch generation failed.');
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const chooseMailFile = async (file) => {
    setMailFile(file || null);
    setResult(null);
    setError('');
    if (!file) return;
    try {
      const headers = await readCsvHeaders(file);
      setMailHeaders(headers);
      const email = headers.find((header) => header.toLowerCase().includes('email'));
      const name = headers.find((header) => header.toLowerCase().includes('participant') || header.toLowerCase().includes('name'));
      setMailTemplate((current) => ({
        ...current,
        email_column: email || current.email_column,
        name_column: name || current.name_column,
      }));
    } catch {
      setError('Could not read CSV headers.');
    }
  };

  const runEmail = async () => {
    if (!mailFile) return;
    setBusy(true);
    setProgress(2);
    setError('');
    setResult(null);
    try {
      const mailed = await emailCertificateBatch(id, mailFile, mailTemplate, setProgress);
      setResult({ type: 'email', ...mailed });
      setProgress(100);
    } catch (caught) {
      setError(caught?.message || 'Certificate email batch failed.');
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const downloadCsvTemplate = () => {
    const headers = manualVariables.map((variable) => variable.name);
    const sample = manualVariables.map((variable) => variable.sample_value || variable.default_value || '');
    const blob = new Blob([`${headers.join(',')}\n${sample.join(',')}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${template.name.replace(/\s+/g, '-').toLowerCase()}-batch-template.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const sourcePicker = (
    <div className="certificate-import-panel">
      <div className="certificate-generator-title">
        <span><FileSpreadsheet /></span>
        <div>
          <h2>Import from Tiesverse data</h2>
          <p>Pull pending webinar registrations for a selected event, or pending offer-letter candidates.</p>
        </div>
      </div>
      <div className="certificate-field-grid">
        <label className="certificate-field">
          <span>Import source</span>
          <select value={sourceType} onChange={(event) => { setSourceType(event.target.value); setSourceRows([]); }}>
            <option value="webinar">Webinar / event registrations</option>
            <option value="offer">Pending offer letters</option>
          </select>
        </label>
        {sourceType === 'webinar' ? (
          <label className="certificate-field">
            <span>Event</span>
            <select value={eventKey} onChange={(event) => { setEventKey(event.target.value); setSourceRows([]); }}>
              {(sources.webinar_events || []).map((event) => (
                <option key={event.event_key} value={event.event_key}>{event.event_title} ({event.pending} pending)</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="certificate-import-stat">
            <strong>{sources.offer_letters?.pending || 0}</strong>
            <span>pending offer certificates</span>
          </div>
        )}
      </div>
      {sourceType === 'webinar' && selectedEvent && (
        <p className="certificate-muted">{selectedEvent.pending} pending out of {selectedEvent.total} confirmed registrations for this event.</p>
      )}
      <div className="certificate-import-actions">
        <button type="button" className="certificate-secondary-action" disabled={sourceLoading} onClick={loadSourceRows}>
          {sourceLoading ? <LoaderCircle className="certificate-spin" /> : <UserRound />} Show pending rows
        </button>
        <button type="button" className="certificate-secondary-action" disabled={busy} onClick={downloadImportedCsv}>
          <Download /> Import IDs + download CSV
        </button>
        <button type="button" className="certificate-primary-action" disabled={busy} onClick={importPendingRecords}>
          {busy ? <LoaderCircle className="certificate-spin" /> : <Sparkles />} Import pending records
        </button>
      </div>
      {sourceRows.length > 0 && (
        <div className="certificate-import-preview">
          <strong>Pending for certificate generation</strong>
          {sourceRows.slice(0, 6).map((row) => (
            <span key={row.source_ref}>{row.person_name} · {row.person_email || row.subject_title}</span>
          ))}
          {sourceRows.length > 6 && <em>+{sourceRows.length - 6} more</em>}
        </div>
      )}
    </div>
  );

  if (!template && !error) return <div className="certificate-empty"><LoaderCircle className="certificate-spin" /> Loading generator…</div>;

  return (
    <section className="certificate-page certificate-generate-page">
      <header className="certificate-page-header">
        <div>
          <button type="button" className="certificate-back-button" onClick={() => navigate(`/certificates/templates/${id}/editor`)}><ArrowLeft /> Back to editor</button>
          <span className="certificate-eyebrow">Generate documents</span>
          <h1>{template?.name || 'Certificate Generator'}</h1>
          <p>Generate one certificate, process a CSV batch, or email personalized documents automatically.</p>
        </div>
      </header>

      <nav className="certificate-mode-tabs">
        <button type="button" className={mode === 'single' ? 'is-active' : ''} onClick={() => { setMode('single'); setResult(null); }}><UserRound /> Single</button>
        <button type="button" className={mode === 'batch' ? 'is-active' : ''} onClick={() => { setMode('batch'); setResult(null); }}><FileSpreadsheet /> Batch CSV</button>
        <button type="button" className={mode === 'email' ? 'is-active' : ''} onClick={() => { setMode('email'); setResult(null); }}><Mail /> Email batch</button>
      </nav>

      {error && <div className="certificate-alert is-error">{error}</div>}

      {mode === 'single' && (
        <div className="certificate-generator-card">
          <div className="certificate-generator-title"><span><Sparkles /></span><div><h2>Personalize one certificate</h2><p>Enter values for the template variables.</p></div></div>
          <div className="certificate-generator-fields">
            {manualVariables.map((variable) => (
              <label className="certificate-field" key={variable.name}>
                <span>{variable.label || variable.name.replaceAll('_', ' ')}{variable.required ? ' *' : ''}</span>
                {variable.type === 'multiline'
                  ? <textarea value={values[variable.name] || ''} onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))} />
                  : <input type={['date', 'email', 'number'].includes(variable.type) ? variable.type : 'text'} value={values[variable.name] || ''} onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))} required={variable.required} />}
                {variable.description && <small>{variable.description}</small>}
              </label>
            ))}
            {manualVariables.length === 0 && <p className="certificate-muted">All values are generated automatically by this template.</p>}
          </div>
          <button type="button" className="certificate-primary-action" disabled={busy} onClick={runSingle}>{busy ? <LoaderCircle className="certificate-spin" /> : <Sparkles />} Generate certificate</button>
        </div>
      )}

      {mode === 'batch' && (
        <>
          {sourcePicker}
          <div className="certificate-generator-card">
            <div className="certificate-generator-title"><span><FileSpreadsheet /></span><div><h2>Generate from CSV</h2><p>Each row becomes one certificate inside a downloadable ZIP archive.</p></div></div>
            <button type="button" className="certificate-secondary-action" onClick={downloadCsvTemplate}><Download /> Download CSV template</button>
            <label className="certificate-file-picker">
              <FileSpreadsheet />
              <strong>{csvFile?.name || 'Choose CSV file'}</strong>
              <span>Required columns: {manualVariables.map((variable) => variable.name).join(', ') || 'none'}</span>
              <input hidden type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} />
            </label>
            <button type="button" className="certificate-primary-action" disabled={!csvFile || busy} onClick={runBatch}>{busy ? <LoaderCircle className="certificate-spin" /> : <Sparkles />} Generate batch</button>
          </div>
        </>
      )}

      {mode === 'email' && (
        <div className="certificate-email-layout">
          <div className="certificate-generator-card">
            <div className="certificate-generator-title"><span><Mail /></span><div><h2>Email certificates</h2><p>Generate in memory and deliver through the configured Apps Script webhook.</p></div></div>
            {sourcePicker}
            <label className="certificate-file-picker">
              <FileSpreadsheet />
              <strong>{mailFile?.name || 'Choose recipient CSV'}</strong>
              <span>Include template fields and one recipient email column.</span>
              <input hidden type="file" accept=".csv,text/csv" onChange={(event) => chooseMailFile(event.target.files?.[0] || null)} />
            </label>
            {mailHeaders.length > 0 && (
              <div className="certificate-field-grid">
                <label className="certificate-field"><span>Email column</span><select value={mailTemplate.email_column} onChange={(event) => setMailTemplate((current) => ({ ...current, email_column: event.target.value }))}>{mailHeaders.map((header) => <option key={header}>{header}</option>)}</select></label>
                <label className="certificate-field"><span>Name column</span><select value={mailTemplate.name_column || ''} onChange={(event) => setMailTemplate((current) => ({ ...current, name_column: event.target.value }))}>{mailHeaders.map((header) => <option key={header}>{header}</option>)}</select></label>
              </div>
            )}
            <div className="certificate-email-mode">
              <button type="button" className={!mailTemplate.html_mode ? 'is-active' : ''} onClick={() => setMailTemplate((current) => ({ ...current, html_mode: false }))}>Visual fields</button>
              <button type="button" className={mailTemplate.html_mode ? 'is-active' : ''} onClick={() => setMailTemplate((current) => ({ ...current, html_mode: true }))}>Custom HTML</button>
            </div>
            <div className="certificate-field-grid">
              <label className="certificate-field"><span>Sender name</span><input value={mailTemplate.sender_name || ''} onChange={(event) => setMailTemplate((current) => ({ ...current, sender_name: event.target.value }))} /></label>
              <label className="certificate-field"><span>Reply-to</span><input type="email" value={mailTemplate.reply_to || ''} onChange={(event) => setMailTemplate((current) => ({ ...current, reply_to: event.target.value }))} /></label>
            </div>
            <label className="certificate-field"><span>Subject</span><input value={mailTemplate.subject} onChange={(event) => setMailTemplate((current) => ({ ...current, subject: event.target.value }))} /></label>
            <label className="certificate-field"><span>Attachment filename</span><input value={mailTemplate.attachment_filename} onChange={(event) => setMailTemplate((current) => ({ ...current, attachment_filename: event.target.value }))} /></label>
            {mailTemplate.html_mode ? (
              <label className="certificate-field"><span>Email HTML</span><textarea className="is-code" value={mailTemplate.custom_html || ''} onChange={(event) => setMailTemplate((current) => ({ ...current, custom_html: event.target.value }))} /></label>
            ) : (
              <>
                <label className="certificate-field"><span>Title</span><input value={mailTemplate.title} onChange={(event) => setMailTemplate((current) => ({ ...current, title: event.target.value }))} /></label>
                <label className="certificate-field"><span>Greeting</span><input value={mailTemplate.greeting} onChange={(event) => setMailTemplate((current) => ({ ...current, greeting: event.target.value }))} /></label>
                <label className="certificate-field"><span>Body</span><textarea value={mailTemplate.body} onChange={(event) => setMailTemplate((current) => ({ ...current, body: event.target.value }))} /></label>
                <div className="certificate-color-fields">
                  {['primary_color', 'background_color', 'card_color', 'text_color'].map((field) => <label key={field}><span>{field.replace('_color', '')}</span><input type="color" value={mailTemplate[field]} onChange={(event) => setMailTemplate((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
                </div>
              </>
            )}
            <div className="certificate-import-actions">
              <button type="button" className="certificate-primary-action" disabled={busy} onClick={importAndEmailPending}>{busy ? <LoaderCircle className="certificate-spin" /> : <Send />} Import pending and email</button>
              <button type="button" className="certificate-secondary-action" disabled={!mailFile || busy} onClick={runEmail}>{busy ? <LoaderCircle className="certificate-spin" /> : <Send />} Email uploaded CSV</button>
            </div>
          </div>
          <div className="certificate-email-preview">
            <span>Email preview</span>
            <div style={{ background: mailTemplate.background_color, color: mailTemplate.text_color, fontFamily: mailTemplate.font_family }}>
              <article style={{ background: mailTemplate.card_color }}>
                <small>{mailTemplate.sender_name}</small>
                <h2 style={{ color: mailTemplate.primary_color }}>{mailTemplate.title}</h2>
                <strong>{mailTemplate.greeting}</strong>
                <p>{mailTemplate.body}</p>
                <em>{mailTemplate.footer}</em>
              </article>
            </div>
          </div>
        </div>
      )}

      {busy && mode !== 'single' && <div className="certificate-generation-progress"><span><i style={{ width: `${progress}%` }} /></span><strong>{progress < 100 ? `Processing… ${progress}%` : 'Complete'}</strong></div>}

      {result?.type === 'single' && (
        <div className="certificate-result">
          <CheckCircle2 />
          <div><strong>Certificate generated</strong><span>Your personalized PDF is ready.</span></div>
          <button type="button" onClick={() => downloadCertificateAsset(result.blob, `${template.name}.pdf`)}><Download /> Download PDF</button>
        </div>
      )}
      {result?.type === 'batch' && (
        <div className="certificate-result">
          <CheckCircle2 />
          <div><strong>{result.generated_count || 0} certificates generated</strong><span>{result.error_count || 0} rows reported errors.</span></div>
          <button type="button" onClick={() => downloadCertificateAsset(result.blob, `${template.name}-batch.zip`)}><Download /> Download ZIP</button>
        </div>
      )}
      {result?.type === 'import' && (
        <div className="certificate-result">
          <CheckCircle2 />
          <div><strong>{result.created_count || 0} certificate records imported</strong><span>{result.skipped || 0} existing rows skipped. IDs are now visible under Generated.</span></div>
          <button type="button" onClick={() => navigate('/certificates/generated')}>Open Generated</button>
        </div>
      )}
      {result?.type === 'email' && (
        <div className="certificate-result">
          <CheckCircle2 />
          <div><strong>{result.sent} of {result.attempted} certificates emailed</strong><span>{result.imported_count ? `${result.imported_count} records imported. ` : ''}{result.errors?.length || 0} delivery errors.</span></div>
        </div>
      )}
    </section>
  );
};

export default CertificateGenerate;
