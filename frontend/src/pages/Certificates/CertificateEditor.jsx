import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bold,
  Copy,
  FileImage,
  Italic,
  Link2,
  LoaderCircle,
  Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  certificatePdfSource,
  getCertificateTemplate,
  listCertificateFonts,
  saveCertificateLayout,
  updateCertificatePages,
  uploadCertificateFont,
} from './certificateApi';
import {
  fillCertificateVariables,
  mergeCertificateVariables,
  newCertificateElement,
  newCertificateVariable,
  normalizeCertificateElement,
  normalizeVariableName,
} from './certificateUtils';
import './Certificates.css';

// Cache-buster (?v=2): the worker .mjs was previously cached `immutable` with a
// wrong MIME type, so a plain refresh won't re-fetch it. A new query key forces
// browsers to fetch it fresh (nginx now serves .mjs as application/javascript).
pdfjs.GlobalWorkerOptions.workerSrc = `${new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()}?v=2`;

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

class CertificatePdfBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const CertificateEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const imageInput = useRef(null);
  const fontInput = useRef(null);
  const [template, setTemplate] = useState(null);
  const [elements, setElements] = useState([]);
  const [variables, setVariables] = useState([]);
  const [fonts, setFonts] = useState([{ family: 'Helvetica' }, { family: 'Times New Roman' }, { family: 'Courier' }]);
  const [selectedId, setSelectedId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(0.85);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [panel, setPanel] = useState('format');

  useEffect(() => {
    Promise.all([getCertificateTemplate(id), listCertificateFonts().catch(() => [])])
      .then(([data, remoteFonts]) => {
        const normalized = (data.text_elements || []).map(normalizeCertificateElement);
        setPdfError('');
        setTemplate(data);
        setElements(normalized);
        setVariables(mergeCertificateVariables(data.variables || [], normalized));
        if (remoteFonts.length) setFonts(remoteFonts);
      })
      .catch((caught) => setError(caught?.message || 'Could not load template.'));
  }, [id]);

  const selected = elements.find((element) => element.id === selectedId) || null;
  const templateId = template?.id || '';
  const page = template?.pages?.find((item) => item.page_number === currentPage) || template?.pages?.[0];
  const effectiveVariables = useMemo(
    () => mergeCertificateVariables(variables, elements),
    [variables, elements],
  );
  const sampleData = useMemo(() => Object.fromEntries(effectiveVariables.map((variable) => [
    variable.name,
    variable.sample_value || variable.default_value || variable.label || variable.name,
  ])), [effectiveVariables]);
  const pdfFile = useMemo(() => (
    templateId ? certificatePdfSource(templateId) : null
  ), [templateId]);

  const patchElement = (elementId, patch) => {
    setElements((current) => current.map((element) => (
      element.id === elementId ? { ...element, ...patch } : element
    )));
  };

  const addText = () => {
    const name = `field_${effectiveVariables.length + 1}`;
    const element = newCertificateElement(currentPage, elements.length + 1, name);
    setElements((current) => [...current, element]);
    setVariables((current) => [...current, newCertificateVariable(name)]);
    setSelectedId(element.id);
    setPanel('format');
  };

  const addButton = () => {
    const element = {
      ...newCertificateElement(currentPage, elements.length + 1, 'button_label'),
      element_type: 'button',
      content: 'Open link',
      hyperlink_url: 'https://example.com',
      width: 180,
      height: 48,
      font_size: 17,
      is_bold: true,
      text_color: '#ffffff',
      background_color: '#3525cd',
      background_opacity: 1,
      border_radius: 999,
      padding_top: 10,
      padding_right: 16,
      padding_bottom: 10,
      padding_left: 16,
    };
    setElements((current) => [...current, element]);
    setSelectedId(element.id);
  };

  const addImage = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const element = {
        ...newCertificateElement(currentPage, elements.length + 1, 'image'),
        element_type: 'image',
        content: '',
        image_src: String(reader.result),
        image_alt: file.name,
        width: 180,
        height: 120,
      };
      setElements((current) => [...current, element]);
      setSelectedId(element.id);
    };
    reader.onerror = () => setError('Could not read image.');
    reader.readAsDataURL(file);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const clone = {
      ...selected,
      id: crypto.randomUUID(),
      x: selected.x + 18,
      y: selected.y + 18,
      z_index: elements.length + 1,
    };
    setElements((current) => [...current, clone]);
    setSelectedId(clone.id);
  };

  const deleteSelected = () => {
    if (!selected) return;
    setElements((current) => current.filter((element) => element.id !== selected.id));
    setSelectedId('');
  };

  const beginDrag = (event, element) => {
    if (preview || element.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(element.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = element.x;
    const originalY = element.y;
    const move = (moveEvent) => {
      const x = Math.max(0, Math.min((page?.width || 1000) - element.width, originalX + ((moveEvent.clientX - startX) / zoom)));
      const y = Math.max(0, Math.min((page?.height || 1000) - element.height, originalY + ((moveEvent.clientY - startY) / zoom)));
      patchElement(element.id, { x, y });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const save = async () => {
    if (!template) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveCertificateLayout(template.id, {
        name: template.name,
        text_elements: elements,
        variables: effectiveVariables,
      });
      const normalized = (saved.text_elements || []).map(normalizeCertificateElement);
      setTemplate(saved);
      setElements(normalized);
      setVariables(mergeCertificateVariables(saved.variables || [], normalized));
      setMessage('Template layout saved.');
    } catch (caught) {
      setError(caught?.message || 'Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  const changePages = async (nextPages) => {
    setSaving(true);
    setError('');
    try {
      const saved = await updateCertificatePages(template.id, nextPages.map((item) => item.source_page_number));
      setTemplate(saved);
      setElements((saved.text_elements || []).map(normalizeCertificateElement));
      setCurrentPage(saved.pages?.[0]?.page_number || 1);
      setSelectedId('');
    } catch (caught) {
      setError(caught?.message || 'Could not update pages.');
    } finally {
      setSaving(false);
    }
  };

  const movePage = (target, direction) => {
    const pages = [...template.pages];
    const index = pages.findIndex((item) => item.source_page_number === target.source_page_number);
    const destination = direction === 'up' ? index - 1 : index + 1;
    if (destination < 0 || destination >= pages.length) return;
    [pages[index], pages[destination]] = [pages[destination], pages[index]];
    changePages(pages);
  };

  const renameVariable = (oldName, rawName) => {
    const name = normalizeVariableName(rawName);
    setVariables((current) => current.map((variable) => (
      variable.name === oldName ? { ...variable, name, label: variable.label || name.replaceAll('_', ' ') } : variable
    )));
    setElements((current) => current.map((element) => ({
      ...element,
      content: String(element.content || '').replaceAll(`{{${oldName}}}`, `{{${name}}}`),
    })));
  };

  const handleFontUpload = async (file) => {
    if (!file) return;
    setError('');
    try {
      const uploaded = await uploadCertificateFont(file);
      setFonts((current) => [...current.filter((font) => font.family !== uploaded.family), uploaded]);
      if (selected) patchElement(selected.id, { font_family: uploaded.family });
      setMessage(`Font "${uploaded.family}" uploaded.`);
    } catch (caught) {
      setError(caught?.message || 'Font upload failed.');
    }
  };

  if (error && !template) return <div className="certificate-empty is-error">{error}</div>;
  if (!template || !page) return <div className="certificate-empty"><LoaderCircle className="certificate-spin" /> Loading PDF editor…</div>;

  const pageElements = elements.filter((element) => element.page_number === currentPage);

  return (
    <section className="certificate-editor">
      <header className="certificate-editor-toolbar">
        <div className="certificate-editor-titlebar">
          <button type="button" className="is-icon" onClick={() => navigate('/certificates/templates')} title="Back to templates"><ArrowLeft /></button>
          <div>
            <span>Certificate Studio</span>
            <input className="certificate-template-name" value={template.name} onChange={(event) => setTemplate({ ...template, name: event.target.value })} />
          </div>
        </div>
        <div className="certificate-toolbar-group">
          <button type="button" className="is-icon" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}><ZoomIn /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="is-icon" onClick={() => setZoom((value) => Math.max(0.35, value - 0.1))}><ZoomOut /></button>
        </div>
        <button type="button" className={preview ? 'is-active' : ''} onClick={() => setPreview((value) => !value)}>Preview</button>
        <button type="button" className="is-primary" disabled={saving} onClick={save}>{saving ? <LoaderCircle className="certificate-spin" /> : <Save />} Save</button>
        <button type="button" className="is-primary" onClick={() => navigate(`/certificates/templates/${id}/generate`)}><Sparkles /> Generate</button>
      </header>

      {(error || message) && <div className={`certificate-editor-message ${error ? 'is-error' : ''}`}>{error || message}</div>}

      <div className="certificate-editor-workspace">
        <aside className="certificate-page-sidebar">
          <h2>Pages</h2>
          <Document file={pdfFile} loading={<div className="certificate-page-thumb-loading">Loading previews…</div>} onLoadError={() => {}}>
          {template.pages.map((item) => (
            <div className={`certificate-page-item ${item.page_number === currentPage ? 'is-active' : ''}`} key={item.source_page_number}>
              <button type="button" onClick={() => setCurrentPage(item.page_number)}>
                <i aria-hidden="true" />
                <span>{item.page_number}</span>
                <small>{Math.round(item.width)} × {Math.round(item.height)}</small>
              </button>
              <div>
                <button type="button" disabled={item.page_number === 1 || saving} onClick={() => movePage(item, 'up')}><ArrowUp /></button>
                <button type="button" disabled={item.page_number === template.pages.length || saving} onClick={() => movePage(item, 'down')}><ArrowDown /></button>
                <button type="button" disabled={template.pages.length <= 1 || saving} onClick={() => {
                  if (window.confirm(`Delete page ${item.page_number}?`)) changePages(template.pages.filter((pageItem) => pageItem.source_page_number !== item.source_page_number));
                }}><Trash2 /></button>
              </div>
            </div>
          ))}
          </Document>
        </aside>

        <main className="certificate-canvas-scroll" onMouseDown={() => setSelectedId('')}>
          <div className="certificate-floating-tools" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={addText}><Type /> Add Text</button>
            <button type="button" onClick={addButton}><Link2 /> Add Button</button>
            <button type="button" onClick={() => imageInput.current?.click()}><FileImage /> Add Image</button>
            <input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => addImage(event.target.files?.[0])} />
          </div>
          <CertificatePdfBoundary
            key={`${template.id}-${page.source_page_number}`}
            onError={(caught) => setPdfError(caught?.message || 'Could not render PDF page.')}
            fallback={<div className="certificate-empty is-error">Could not render PDF page. Please refresh the editor.</div>}
          >
          <Document
            file={pdfFile}
            loading={<div className="certificate-empty">Loading PDF…</div>}
            onLoadSuccess={() => setPdfError('')}
            onLoadError={(caught) => setPdfError(caught?.message || 'Could not load PDF.')}
          >
            <div className="certificate-pdf-canvas" style={{ width: page.width * zoom, height: page.height * zoom }}>
              <Page
                key={`${template.id}-${page.source_page_number}-${zoom}`}
                pageNumber={page.source_page_number}
                width={page.width * zoom}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                loading={<div className="certificate-empty">Rendering page…</div>}
                onLoadError={(caught) => setPdfError(caught?.message || 'Could not render PDF page.')}
              />
              {pageElements.map((element) => {
                const content = preview ? fillCertificateVariables(element.content, sampleData, effectiveVariables, { preview: true }) : element.content;
                const overlayStyle = {
                  left: element.x * zoom,
                  top: element.y * zoom,
                  width: element.width * zoom,
                  height: element.height * zoom,
                  zIndex: element.z_index,
                  color: element.text_color,
                  backgroundColor: element.background_color || 'transparent',
                  opacity: element.text_opacity,
                  fontFamily: element.font_family,
                  fontSize: element.font_size * zoom,
                  fontWeight: element.is_bold ? 700 : element.font_weight,
                  fontStyle: element.is_italic ? 'italic' : element.font_style,
                  textDecoration: `${element.is_underline ? 'underline ' : ''}${element.is_strikethrough ? 'line-through' : ''}`.trim() || 'none',
                  textAlign: element.text_align,
                  lineHeight: element.line_height,
                  letterSpacing: element.letter_spacing * zoom,
                  border: element.border_width ? `${element.border_width * zoom}px ${element.border_style} ${element.border_color}` : undefined,
                  borderRadius: element.border_radius * zoom,
                  transform: `rotate(${element.rotation}deg)`,
                  padding: `${element.padding_top * zoom}px ${element.padding_right * zoom}px ${element.padding_bottom * zoom}px ${element.padding_left * zoom}px`,
                  overflow: element.clip_overflow ? 'hidden' : 'visible',
                  alignItems: element.vertical_align === 'middle' ? 'center' : element.vertical_align === 'bottom' ? 'flex-end' : 'flex-start',
                  justifyContent: element.text_align === 'center' ? 'center' : element.text_align === 'right' ? 'flex-end' : 'flex-start',
                };
                return (
                  <div
                    key={element.id}
                    className={`certificate-overlay ${selectedId === element.id ? 'is-selected' : ''} type-${element.element_type}`}
                    style={overlayStyle}
                    onPointerDown={(event) => beginDrag(event, element)}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(element.id);
                      setPanel('format');
                    }}
                  >
                    {element.element_type === 'image'
                      ? <img src={element.image_src} alt={element.image_alt || ''} draggable="false" />
                      : content}
                  </div>
                );
              })}
            </div>
          </Document>
          </CertificatePdfBoundary>
          {pdfError && <div className="certificate-editor-message is-error">{pdfError}</div>}
        </main>

        <aside className="certificate-properties">
          <div className="certificate-properties-tabs">
            <button type="button" className={panel === 'format' ? 'is-active' : ''} onClick={() => setPanel('format')}>Element</button>
            <button type="button" className={panel === 'variables' ? 'is-active' : ''} onClick={() => setPanel('variables')}>Variables ({effectiveVariables.length})</button>
          </div>

          {panel === 'format' ? (
            selected ? (
              <div className="certificate-property-stack">
                <div className="certificate-properties-heading">
                  <div><strong>{selected.element_type} element</strong><span>Page {selected.page_number}</span></div>
                  <div>
                    <button type="button" onClick={() => patchElement(selected.id, { locked: !selected.locked })}>{selected.locked ? <Lock /> : <Unlock />}</button>
                    <button type="button" onClick={duplicateSelected}><Copy /></button>
                    <button type="button" className="is-danger" onClick={deleteSelected}><Trash2 /></button>
                  </div>
                </div>

                {selected.element_type !== 'image' && (
                  <label className="certificate-field is-wide"><span>Content</span><textarea value={selected.content} onChange={(event) => patchElement(selected.id, { content: event.target.value })} /></label>
                )}
                {selected.element_type === 'button' && (
                  <label className="certificate-field is-wide"><span>Hyperlink</span><input value={selected.hyperlink_url || ''} onChange={(event) => patchElement(selected.id, { hyperlink_url: event.target.value })} /></label>
                )}
                <div className="certificate-field-grid">
                  {['x', 'y', 'width', 'height'].map((field) => (
                    <label className="certificate-field" key={field}><span>{field}</span><input type="number" value={Math.round(selected[field] * 10) / 10} onChange={(event) => patchElement(selected.id, { [field]: numberValue(event.target.value, selected[field]) })} /></label>
                  ))}
                </div>

                {selected.element_type !== 'image' && (
                  <>
                    <label className="certificate-field is-wide"><span>Font family</span><select value={selected.font_family} onChange={(event) => patchElement(selected.id, { font_family: event.target.value })}>{fonts.map((font) => <option key={font.family} value={font.family}>{font.family}</option>)}</select></label>
                    <button type="button" className="certificate-inline-action" onClick={() => fontInput.current?.click()}><Upload /> Upload font</button>
                    <input ref={fontInput} hidden type="file" accept=".ttf,.otf,.woff,.woff2" onChange={(event) => handleFontUpload(event.target.files?.[0])} />
                    <div className="certificate-field-grid">
                      <label className="certificate-field"><span>Size</span><input type="number" min="4" max="300" value={selected.font_size} onChange={(event) => patchElement(selected.id, { font_size: numberValue(event.target.value, 24) })} /></label>
                      <label className="certificate-field"><span>Color</span><input type="color" value={selected.text_color} onChange={(event) => patchElement(selected.id, { text_color: event.target.value })} /></label>
                    </div>
                    <div className="certificate-format-buttons">
                      <button type="button" className={selected.is_bold ? 'is-active' : ''} onClick={() => patchElement(selected.id, { is_bold: !selected.is_bold })}><Bold /></button>
                      <button type="button" className={selected.is_italic ? 'is-active' : ''} onClick={() => patchElement(selected.id, { is_italic: !selected.is_italic })}><Italic /></button>
                      <button type="button" className={selected.text_align === 'left' ? 'is-active' : ''} onClick={() => patchElement(selected.id, { text_align: 'left' })}><AlignLeft /></button>
                      <button type="button" className={selected.text_align === 'center' ? 'is-active' : ''} onClick={() => patchElement(selected.id, { text_align: 'center' })}><AlignCenter /></button>
                      <button type="button" className={selected.text_align === 'right' ? 'is-active' : ''} onClick={() => patchElement(selected.id, { text_align: 'right' })}><AlignRight /></button>
                    </div>
                    <div className="certificate-field-grid">
                      <label className="certificate-field"><span>Rotation</span><input type="number" value={selected.rotation} onChange={(event) => patchElement(selected.id, { rotation: numberValue(event.target.value) })} /></label>
                      <label className="certificate-field"><span>Line height</span><input type="number" step="0.1" value={selected.line_height} onChange={(event) => patchElement(selected.id, { line_height: numberValue(event.target.value, 1.2) })} /></label>
                      <label className="certificate-field"><span>Letter spacing</span><input type="number" step="0.1" value={selected.letter_spacing} onChange={(event) => patchElement(selected.id, { letter_spacing: numberValue(event.target.value) })} /></label>
                      <label className="certificate-field"><span>Radius</span><input type="number" value={selected.border_radius} onChange={(event) => patchElement(selected.id, { border_radius: numberValue(event.target.value) })} /></label>
                    </div>
                    <label className="certificate-field is-wide"><span>Background</span><div className="certificate-color-row"><input type="color" value={selected.background_color || '#ffffff'} onChange={(event) => patchElement(selected.id, { background_color: event.target.value, background_opacity: 1 })} /><button type="button" onClick={() => patchElement(selected.id, { background_color: null, background_opacity: 0 })}>Clear</button></div></label>
                  </>
                )}
              </div>
            ) : <div className="certificate-properties-empty"><Type /><strong>Select an element</strong><span>Click a text, image, or button overlay to format it.</span></div>
          ) : (
            <div className="certificate-variable-list">
              <header><div><strong>Template variables</strong><span>Detected from {'{{variable_name}}'} fields.</span></div><button type="button" onClick={() => {
                const variable = newCertificateVariable(`field_${effectiveVariables.length + 1}`);
                setVariables((current) => [...current, variable]);
              }}><Plus /></button></header>
              {effectiveVariables.map((variable) => (
                <article key={variable.name}>
                  <label className="certificate-field"><span>Name</span><input defaultValue={variable.name} onBlur={(event) => renameVariable(variable.name, event.target.value)} /></label>
                  <label className="certificate-field"><span>Label</span><input value={variable.label || ''} onChange={(event) => setVariables((current) => current.map((item) => item.name === variable.name ? { ...item, label: event.target.value } : item))} /></label>
                  <div className="certificate-field-grid">
                    <label className="certificate-field"><span>Type</span><select value={variable.type} onChange={(event) => setVariables((current) => current.map((item) => item.name === variable.name ? { ...item, type: event.target.value } : item))}>{['text', 'number', 'date', 'email', 'phone', 'multiline', 'currency'].map((type) => <option key={type}>{type}</option>)}</select></label>
                    <label className="certificate-field"><span>Sample</span><input value={variable.sample_value || ''} onChange={(event) => setVariables((current) => current.map((item) => item.name === variable.name ? { ...item, sample_value: event.target.value } : item))} /></label>
                  </div>
                  <label className="certificate-check"><input type="checkbox" checked={variable.required} onChange={(event) => setVariables((current) => current.map((item) => item.name === variable.name ? { ...item, required: event.target.checked } : item))} /> Required</label>
                  <label className="certificate-check"><input type="checkbox" checked={variable.generator_enabled || false} onChange={(event) => setVariables((current) => current.map((item) => item.name === variable.name ? { ...item, generator_enabled: event.target.checked } : item))} /> Auto-generate value</label>
                  {variable.generator_enabled && <label className="certificate-field"><span>Pattern</span><input value={variable.generator_pattern || ''} placeholder="CERT-{random:6}" onChange={(event) => setVariables((current) => current.map((item) => item.name === variable.name ? { ...item, generator_pattern: event.target.value } : item))} /></label>}
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

export default CertificateEditor;
