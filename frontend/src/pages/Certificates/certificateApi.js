import { API_URL, getApiToken, setApiToken } from '../../apiClient';

export const CERTIFICATE_BACKEND = 'https://auto-document-generator-backend.onrender.com';
const PROXY_BASE = `${API_URL}/api/certificates/proxy`;

const authHeaders = () => ({ Authorization: `Bearer ${getApiToken()}` });

const parseError = async (response) => {
  const payload = await response.json().catch(() => ({ detail: response.statusText }));
  const detail = payload?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || String(item)).join(', ');
  return detail || payload?.error || `Request failed (${response.status})`;
};

const request = async (path, options = {}) => {
  const response = await fetch(`${PROXY_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (response.status === 401) {
    setApiToken(null);
    window.location.href = '/login';
    throw new Error('Session expired.');
  }
  if (!response.ok) throw new Error(await parseError(response));
  if (response.status === 204) return undefined;
  return response.json();
};

const requestBlob = async (path, options = {}) => {
  const response = await fetch(`${PROXY_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(await parseError(response));
  return {
    blob: await response.blob(),
    generated_count: Number(response.headers.get('X-Generated-Count') || 1),
    error_count: Number(response.headers.get('X-Generation-Error-Count') || 0),
  };
};

const upload = (path, formData, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${PROXY_BASE}${path}`);
  xhr.setRequestHeader('Authorization', `Bearer ${getApiToken()}`);
  xhr.responseType = 'text';
  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    onProgress?.(Math.round((event.loaded / event.total) * 100));
  };
  xhr.onerror = () => reject(new Error('Network request failed.'));
  xhr.onload = () => {
    let payload;
    try {
      payload = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
    } catch {
      payload = undefined;
    }
    if (xhr.status < 200 || xhr.status >= 300) {
      reject(new Error(payload?.detail || xhr.statusText || 'Upload failed.'));
      return;
    }
    resolve(payload);
  };
  xhr.send(formData);
});

const uploadBlob = (path, formData, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${PROXY_BASE}${path}`);
  xhr.setRequestHeader('Authorization', `Bearer ${getApiToken()}`);
  xhr.responseType = 'blob';
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
  };
  xhr.onerror = () => reject(new Error('Network request failed.'));
  xhr.onload = async () => {
    if (xhr.status < 200 || xhr.status >= 300) {
      const payload = await xhr.response.text().then(JSON.parse).catch(() => ({}));
      reject(new Error(payload?.detail || xhr.statusText || 'Upload failed.'));
      return;
    }
    resolve({
      blob: xhr.response,
      generated_count: Number(xhr.getResponseHeader('X-Generated-Count') || 0),
      error_count: Number(xhr.getResponseHeader('X-Generation-Error-Count') || 0),
    });
  };
  xhr.send(formData);
});

export const listCertificateTemplates = () => request('/api/templates');
export const getCertificateTemplate = (id) => request(`/api/templates/${id}`);
export const deleteCertificateTemplate = (id) => request(`/api/templates/${id}`, { method: 'DELETE' });
export const uploadCertificateTemplate = (file, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  return upload('/api/templates/upload', form, onProgress);
};
export const saveCertificateLayout = (id, payload) => request(`/api/templates/${id}/save-layout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const updateCertificatePages = (id, sourcePageNumbers) => request(`/api/templates/${id}/pages`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ source_page_numbers: sourcePageNumbers }),
});
export const listCertificateFonts = () => request('/api/editor/fonts');
export const uploadCertificateFont = (file, family, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  if (family?.trim()) form.append('family', family.trim());
  return upload('/api/editor/fonts', form, onProgress);
};
export const generateCertificate = (id, data) => requestBlob(`/api/templates/${id}/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data }),
});
export const generateCertificateBatch = (id, file, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  return uploadBlob(`/api/templates/${id}/generate-batch`, form, onProgress);
};
export const emailCertificateBatch = (id, file, mailTemplate, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  form.append('mail_template_json', JSON.stringify(mailTemplate));
  return upload(`/api/templates/${id}/email-batch`, form, onProgress);
};
export const listGeneratedCertificates = () => request('/api/generated');
const appRequest = async (path, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (response.status === 401) {
    setApiToken(null);
    window.location.href = '/login';
    throw new Error('Session expired.');
  }
  if (!response.ok) throw new Error(await parseError(response));
  if (response.status === 204) return undefined;
  return response.json();
};

export const getCertificateSources = (templateId) => appRequest(`/api/certificates/sources/?template_id=${encodeURIComponent(templateId)}`);
export const getCertificateImportRows = ({ templateId, sourceType, eventKey = '', pendingOnly = true }) => appRequest(
  `/api/certificates/import-rows/?template_id=${encodeURIComponent(templateId)}&source_type=${encodeURIComponent(sourceType)}&event_key=${encodeURIComponent(eventKey)}&pending_only=${pendingOnly ? 'true' : 'false'}`,
);
export const importCertificateRecords = (payload) => appRequest('/api/certificates/import-records/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const listCertificateRecords = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return appRequest(`/api/certificates/records/${query ? `?${query}` : ''}`).then((payload) => payload.records || []);
};
export const markCertificateRecordsEmailed = (recordIds, emailStatus = 'sent') => appRequest('/api/certificates/records/mark-emailed/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ record_ids: recordIds, email_status: emailStatus }),
});
// Bulk-send branded certificate emails via SES (stubbed to console unless
// CERT_EMAIL_ENABLED + SES creds are set). Marks the records emailed on success.
export const sendCertificateEmails = (recordIds) => appRequest('/api/certificates/records/send-emails/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ record_ids: recordIds }),
});
export const downloadCertificateRecordsCsv = async (recordIds) => {
  const response = await fetch(`${API_URL}/api/certificates/records/csv/`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_ids: recordIds }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.blob();
};
export const certificatePdfSource = (id) => ({
  url: `${PROXY_BASE}/api/templates/${id}/original.pdf`,
  httpHeaders: authHeaders(),
});
export const certificateAssetUrl = (path) => `${PROXY_BASE}${path}`;

export const downloadCertificateAsset = async (path, filename) => {
  const blob = path instanceof Blob
    ? path
    : await fetch(certificateAssetUrl(path), { headers: authHeaders() }).then(async (response) => {
      if (!response.ok) throw new Error(await parseError(response));
      return response.blob();
    });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'certificate.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
