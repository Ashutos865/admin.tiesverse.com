/* Every TIES Mail endpoint, one function each. See mail_app/API.md. */
import { get, post, patch, del, upload, downloadFile } from './client.js';

// session + badges
export const getMe = () => get('/api/mail/me');
export const getCounts = () => get('/api/mail/counts');

// messages
export const listMessages = ({ mailbox, folder = 'inbox', search = '', filter = '' }) => {
  const q = new URLSearchParams({ mailbox, folder });
  if (search) q.set('search', search);
  if (filter) q.set('filter', filter);
  return get(`/api/mail/messages/?${q}`);
};
export const getThread = (id) => get(`/api/mail/messages/${id}`);
export const setFlags = (id, flags) => post(`/api/mail/messages/${id}/flags`, flags);
export const trashMessage = (id) => del(`/api/mail/messages/${id}`);
export const restoreMessage = (id) => post(`/api/mail/messages/${id}`, {});
export const cancelSend = (id) => post(`/api/mail/messages/${id}/cancel`, {});
export const releaseSend = (id) => post(`/api/mail/messages/${id}/release`, {});
export const sendMessage = (payload) => post('/api/mail/send', payload);

// drafts
export const listDrafts = (mailbox) => get(`/api/mail/drafts/?mailbox=${mailbox}`);
export const createDraft = (payload) => post('/api/mail/drafts', payload);
export const updateDraft = (id, payload) => patch(`/api/mail/drafts/${id}`, payload);
export const deleteDraft = (id) => del(`/api/mail/drafts/${id}`);

// attachments
export const uploadAttachment = (file, draftId) => {
  const fd = new FormData();
  fd.append('file', file);
  if (draftId) fd.append('draft', draftId);
  return upload('/api/mail/attachments', fd);
};
export const deleteAttachment = (id) => del(`/api/mail/attachments/${id}`);
export const downloadAttachment = (id, filename) =>
  downloadFile(`/api/mail/attachments/${id}/`, filename);

// internal notes — team-visible, never emailed
export const listNotes = (mailbox, threadKey) =>
  get(`/api/mail/notes/?mailbox=${mailbox}&thread_key=${encodeURIComponent(threadKey)}`);
export const addNote = (mailbox, threadKey, body) =>
  post('/api/mail/notes', { mailbox, thread_key: threadKey, body });

// mailbox identity
export const updateMailbox = (id, payload) => patch(`/api/mail/mailboxes/${id}/avatar`, payload);

// administration (superadmin)
export const adminListMailboxes = () => get('/api/mail/admin/mailboxes');
export const adminCreateMailbox = (payload) => post('/api/mail/admin/mailboxes', payload);
export const adminUpdateMailbox = (id, payload) => patch(`/api/mail/admin/mailboxes/${id}`, payload);
export const adminArchiveMailbox = (id) => del(`/api/mail/admin/mailboxes/${id}`);
export const adminSetPassword = (id, password) =>
  post(`/api/mail/admin/mailboxes/${id}/password`, { password });
export const adminListGrants = (id) => get(`/api/mail/admin/mailboxes/${id}/grants/`);
export const adminGrant = (id, user) => post(`/api/mail/admin/mailboxes/${id}/grants`, { user });
export const adminRevoke = (id, user) => del(`/api/mail/admin/mailboxes/${id}/grants/?user=${user}`);
export const adminAudit = (mailbox) =>
  get(`/api/mail/admin/audit/${mailbox ? `?mailbox=${mailbox}` : ''}`);

// Portal accounts, for the mailbox-access picker. Superadmin-only server side.
export const adminListUsers = () => get('/api/accounts/users');

// bulk sends — one personal message per recipient
export const listBulkJobs = (mailbox) => get(`/api/mail/bulk/?mailbox=${mailbox}`);
export const createBulkJob = (payload) => post('/api/mail/bulk', payload);
export const getBulkJob = (id) => get(`/api/mail/bulk/${id}`);
export const deleteBulkJob = (id) => del(`/api/mail/bulk/${id}`);
export const bulkAction = (id, action) => post(`/api/mail/bulk/${id}/${action}`, {});
