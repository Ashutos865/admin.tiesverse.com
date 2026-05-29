import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';
import { Save, RefreshCw, Shield, Check, User as UserIcon, Settings, X as XIcon } from 'lucide-react';

const PermissionsManagement = () => {
  const { authTokens } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [userPerms, setUserPerms] = useState({});
  const [saving, setSaving] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [selectedUser, setSelectedUser] = useState(null);
  
  // State for the pop-up modal
  const [activeModal, setActiveModal] = useState(null); // { appLabel, modelName, perms }

  const headers = { 'Authorization': `Bearer ${authTokens?.access}` };

  useEffect(() => { fetchData(); }, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, permsRes] = await Promise.all([
        axios.get('http://localhost:8000/api/accounts/users/', { headers }),
        axios.get('http://localhost:8000/api/accounts/permissions/', { headers }),
      ]);
      const staffUsers = usersRes.data.filter(u => !u.is_superuser);
      setUsers(staffUsers);
      setAvailablePermissions(permsRes.data);
      const permMap = {};
      staffUsers.forEach(u => { permMap[u.id] = new Set(u.user_permissions || []); });
      setUserPerms(permMap);
      if (staffUsers.length > 0 && !selectedUser) setSelectedUser(staffUsers[0].id);
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast('Failed to load data', 'error');
    }
    setLoading(false);
  };

  const groupedByApp = availablePermissions.reduce((acc, perm) => {
    if (!acc[perm.app_label]) acc[perm.app_label] = {};
    if (!acc[perm.app_label][perm.model]) acc[perm.app_label][perm.model] = [];
    acc[perm.app_label][perm.model].push(perm);
    return acc;
  }, {});

  const friendlyModelNames = {
    'event': 'Events', 'article': 'Articles', 'youtubevideo': 'YouTube Videos',
    'workshop': 'Workshops', 'teammember': 'Team Members', 'guest': 'Guests',
    'position': 'Positions', 'enrollment': 'Enrollments', 'offerletter': 'Offer Letters',
    'webinarevent': 'Webinar Events', 'registrationform': 'Registrations',
    'calendarevent': 'Calendar Events',
  };
  const friendlyAppNames = {
    'tiesverse_app': 'Tiesverse Portal', 'career_app': 'Career Portal', 'webinar_app': 'Webinar Portal',
  };
  const appColors = {
    'tiesverse_app': '#8B5CF6', 'career_app': '#3B82F6', 'webinar_app': '#10B981',
  };
  const actionLabels = { 'view': 'View', 'add': 'Add', 'change': 'Edit', 'delete': 'Delete' };
  const actionColors = { 'view': '#3B82F6', 'add': '#10B981', 'change': '#F59E0B', 'delete': '#EF4444' };

  const togglePermission = (userId, codename) => {
    setUserPerms(prev => {
      const updated = { ...prev };
      const set = new Set(updated[userId]);
      set.has(codename) ? set.delete(codename) : set.add(codename);
      updated[userId] = set;
      return updated;
    });
  };

  const toggleAllForModel = (userId, perms) => {
    setUserPerms(prev => {
      const updated = { ...prev };
      const set = new Set(updated[userId]);
      const allChecked = perms.every(p => set.has(p.codename));
      perms.forEach(p => allChecked ? set.delete(p.codename) : set.add(p.codename));
      updated[userId] = set;
      return updated;
    });
  };

  const toggleAllForApp = (userId, appLabel) => {
    const allPerms = Object.values(groupedByApp[appLabel] || {}).flat();
    setUserPerms(prev => {
      const updated = { ...prev };
      const set = new Set(updated[userId]);
      const allChecked = allPerms.every(p => set.has(p.codename));
      allPerms.forEach(p => allChecked ? set.delete(p.codename) : set.add(p.codename));
      updated[userId] = set;
      return updated;
    });
  };

  const saveUserPermissions = async (userId) => {
    setSaving(userId);
    try {
      const permsList = Array.from(userPerms[userId] || []);
      await axios.patch(`http://localhost:8000/api/accounts/users/${userId}/`, { permissions: permsList }, { headers });
      showToast('Permissions saved successfully!');
    } catch (error) {
      console.error("Error saving permissions:", error);
      showToast('Failed to save permissions', 'error');
    }
    setSaving(null);
  };

  const getPermCount = (userId) => (userPerms[userId]?.size || 0);
  const getTotalPerms = () => availablePermissions.length;
  const selectedUserObj = users.find(u => u.id === selectedUser);

  const getModelSummary = (userId, perms) => {
    const active = perms.filter(p => userPerms[userId]?.has(p.codename)).length;
    if (active === 0) return { text: 'No Access', color: 'var(--text-muted)' };
    if (active === perms.length) return { text: 'Full Access', color: '#10B981' };
    return { text: `${active}/${perms.length} Permissions`, color: '#F59E0B' };
  };

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <RefreshCw size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading permissions...</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes toastIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* ── Toast Notification ── */}
      {toast.show && (
        <div style={{
          ...styles.toast,
          background: toast.type === 'error' ? '#EF4444' : '#10B981',
          animation: 'toastIn 0.3s ease forwards',
        }}>
          <Check size={16} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* ── POP-UP MODAL for Permissions ── */}
      {activeModal && (
        <div style={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>
                  {friendlyModelNames[activeModal.modelName] || activeModal.modelName} Permissions
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Configuring access for <b>{selectedUserObj?.username}</b>
                </span>
              </div>
              <button onClick={() => setActiveModal(null)} style={styles.closeBtn}>
                <XIcon size={20} />
              </button>
            </div>
            
            <div style={styles.modalBody}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Toggle the specific actions this user is allowed to perform on this module.
              </p>
              
              <div style={styles.modalPills}>
                {activeModal.perms.map(perm => {
                  const action = perm.codename.split('_')[0];
                  const isActive = userPerms[selectedUser]?.has(perm.codename) || false;
                  const ac = actionColors[action] || 'var(--primary)';
                  return (
                    <button
                      key={perm.id}
                      onClick={() => togglePermission(selectedUser, perm.codename)}
                      style={{
                        ...styles.modalPill,
                        background: isActive ? ac : 'transparent',
                        borderColor: isActive ? ac : 'var(--border)',
                        color: isActive ? '#fff' : 'var(--text-main)',
                      }}
                    >
                      <span style={styles.modalCheckWrap}>
                        {isActive && <Check size={14} />}
                      </span>
                      {actionLabels[action] || action}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div style={styles.modalFooter}>
              <button 
                onClick={() => toggleAllForModel(selectedUser, activeModal.perms)} 
                style={styles.modalAllBtn}
              >
                {activeModal.perms.every(p => userPerms[selectedUser]?.has(p.codename)) ? 'Revoke All' : 'Grant All'}
              </button>
              <button onClick={() => setActiveModal(null)} style={styles.modalDoneBtn}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <Shield size={26} style={{ color: 'var(--primary)' }} />
            Permissions Management
          </h1>
          <p style={styles.subtitle}>
            Select a user on the left, then click the settings gear to configure module permissions.
          </p>
        </div>
        <button onClick={fetchData} style={styles.refreshBtn}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {users.length === 0 ? (
        <div style={styles.emptyState}>
          <UserIcon size={40} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
            No staff users found. Create staff users first from User Management.
          </p>
        </div>
      ) : (
        <div style={styles.layout}>

          {/* ── Left: User List ── */}
          <div style={styles.userListWrap}>
            <div style={styles.userListHeader}>Staff Users</div>
            <div style={styles.userList}>
              {users.map(u => {
                const isSelected = selectedUser === u.id;
                const count = getPermCount(u.id);
                const total = getTotalPerms();
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div
                    key={u.id}
                    onClick={() => { setSelectedUser(u.id); setActiveModal(null); }}
                    style={{
                      ...styles.userCard,
                      borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                      background: isSelected ? 'rgba(79,70,229,0.08)' : 'var(--surface)',
                    }}
                  >
                    <div style={styles.userCardTop}>
                      <span style={styles.userName}>{u.username}</span>
                      <span style={{
                        ...styles.roleBadge,
                        background: u.is_staff ? 'rgba(59,130,246,0.15)' : 'rgba(148,163,184,0.1)',
                        color: u.is_staff ? '#3B82F6' : 'var(--text-muted)',
                      }}>
                        {u.is_staff ? 'Staff' : 'Regular'}
                      </span>
                    </div>
                    <div style={styles.userEmail}>{u.email || 'No email set'}</div>
                    <div style={styles.progressWrap}>
                      <div style={{ ...styles.progressBar, width: `${pct}%` }} />
                    </div>
                    <div style={styles.permCountText}>{count} / {total} permissions</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: Permission Detail ── */}
          <div style={styles.detailWrap}>
            {selectedUserObj && (
              <>
                <div style={styles.detailBanner}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                      {selectedUserObj.username}
                    </span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.75rem', fontSize: '0.8rem' }}>
                      {getPermCount(selectedUser)} permissions assigned
                    </span>
                  </div>
                  <button
                    onClick={() => saveUserPermissions(selectedUser)}
                    disabled={saving === selectedUser}
                    style={styles.saveBtn}
                  >
                    <Save size={15} />
                    {saving === selectedUser ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                <div style={styles.sectionsWrap}>
                  {Object.entries(groupedByApp).map(([appLabel, models]) => {
                    const allPerms = Object.values(models).flat();
                    const allChecked = allPerms.every(p => userPerms[selectedUser]?.has(p.codename));
                    const someChecked = allPerms.some(p => userPerms[selectedUser]?.has(p.codename));
                    const color = appColors[appLabel] || 'var(--primary)';

                    return (
                      <div key={appLabel} style={styles.appSection}>
                        <div style={styles.appHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ ...styles.appDot, background: color }} />
                            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                              {friendlyAppNames[appLabel] || appLabel}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              ({allPerms.filter(p => userPerms[selectedUser]?.has(p.codename)).length}/{allPerms.length})
                            </span>
                          </div>
                          <button
                            onClick={() => toggleAllForApp(selectedUser, appLabel)}
                            style={{
                              ...styles.grantAllBtn,
                              background: allChecked ? color : 'transparent',
                              borderColor: someChecked ? color : 'var(--border)',
                              color: allChecked ? '#fff' : color,
                            }}
                          >
                            {allChecked ? '✓ All Granted' : 'Grant All'}
                          </button>
                        </div>

                        {Object.entries(models).map(([modelName, perms]) => {
                          const summary = getModelSummary(selectedUser, perms);
                          
                          // FORCE ORDER: view, add, change, delete
                          const orderedActions = ['view', 'add', 'change', 'delete'];
                          const sortedPerms = [...perms].sort((a, b) => {
                            const aAction = a.codename.split('_')[0];
                            const bAction = b.codename.split('_')[0];
                            return orderedActions.indexOf(aAction) - orderedActions.indexOf(bAction);
                          });

                          return (
                            <div key={modelName} style={styles.modelRow}>
                              <div style={styles.modelLeft}>
                                <span style={styles.modelName}>
                                  {friendlyModelNames[modelName] || modelName}
                                </span>
                              </div>
                              <div style={styles.modelRight}>
                                <span style={{ ...styles.summaryText, color: summary.color }}>
                                  {summary.text}
                                </span>
                                <button
                                  onClick={() => setActiveModal({ appLabel, modelName, perms: sortedPerms })}
                                  style={styles.configBtn}
                                >
                                  <Settings size={14} /> Configure
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Styles Object ─── */
const styles = {
  loadingWrap: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    height: '50vh', flexDirection: 'column', gap: '0.75rem',
  },
  toast: {
    position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
    zIndex: 9999, display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.7rem 1.4rem', borderRadius: '10px', color: '#fff',
    fontWeight: 600, fontSize: '0.85rem',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '1.25rem',
  },
  title: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)',
    letterSpacing: '-0.02em', margin: 0,
  },
  subtitle: {
    color: 'var(--text-muted)', marginTop: '0.3rem', fontSize: '0.82rem', margin: '0.3rem 0 0 0',
  },
  refreshBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.2s',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '4rem', background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: '12px',
  },
  layout: {
    display: 'flex', gap: '1.25rem', height: 'calc(100vh - 210px)', minHeight: '400px',
  },

  /* ── User List ── */
  userListWrap: {
    width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
    overflow: 'hidden',
  },
  userListHeader: {
    padding: '0.8rem 1rem', fontWeight: 600, fontSize: '0.85rem',
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
  },
  userList: {
    flex: 1, overflowY: 'auto', padding: '0.6rem',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  userCard: {
    padding: '0.8rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border)',
    cursor: 'pointer', transition: 'all 0.2s',
  },
  userCardTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  userName: { fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' },
  roleBadge: {
    padding: '2px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 600,
  },
  userEmail: {
    fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  progressWrap: {
    height: '4px', borderRadius: '2px', background: 'var(--border)',
    marginTop: '8px', overflow: 'hidden',
  },
  progressBar: {
    height: '100%', borderRadius: '2px', background: 'var(--primary)',
    transition: 'width 0.3s ease',
  },
  permCountText: {
    fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px',
  },

  /* ── Detail Panel ── */
  detailWrap: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  detailBanner: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.8rem 1.1rem', background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '0.75rem',
  },
  saveBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1.4rem', borderRadius: '8px', border: 'none',
    background: 'var(--primary)', color: '#fff', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
  },
  sectionsWrap: {
    flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem',
    paddingBottom: '1rem',
  },

  /* ── App Section ── */
  appSection: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', overflow: 'hidden',
    flexShrink: 0,
  },
  appHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.8rem 1rem', borderBottom: '1px solid var(--border)',
  },
  appDot: {
    width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
  },
  grantAllBtn: {
    padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--border)',
    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s',
  },

  /* ── Model Row ── */
  modelRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.75rem 1.2rem', borderBottom: '1px solid rgba(51,65,85,0.4)',
    transition: 'background 0.15s',
  },
  modelLeft: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  },
  modelName: {
    fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-main)',
  },
  modelRight: {
    display: 'flex', alignItems: 'center', gap: '1rem',
  },
  summaryText: {
    fontSize: '0.8rem', fontWeight: 500,
  },
  configBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'var(--surface-hover)', color: 'var(--text-main)', cursor: 'pointer',
    fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s',
  },

  /* ── Modal ── */
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    animation: 'modalFadeIn 0.2s ease', backdropFilter: 'blur(4px)'
  },
  modalContent: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '16px', width: '90%', maxWidth: '420px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
    animation: 'modalSlideUp 0.3s ease', overflow: 'hidden'
  },
  modalHeader: {
    padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
  },
  closeBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', padding: '4px', display: 'flex'
  },
  modalBody: {
    padding: '1.5rem',
  },
  modalPills: {
    display: 'flex', flexDirection: 'column', gap: '0.6rem'
  },
  modalPill: {
    display: 'flex', alignItems: 'center', padding: '0.85rem 1.25rem',
    borderRadius: '8px', border: '1px solid var(--border)',
    cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, transition: 'all 0.2s',
    gap: '0.75rem'
  },
  modalCheckWrap: {
    width: '20px', height: '20px', borderRadius: '4px', 
    border: '1.5px solid currentColor', display: 'flex', 
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.1)'
  },
  modalFooter: {
    padding: '1rem 1.5rem', borderTop: '1px solid var(--border)',
    display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.1)'
  },
  modalAllBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-muted)', padding: '0.5rem 1rem', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s'
  },
  modalDoneBtn: {
    background: 'var(--primary)', border: 'none', color: '#fff',
    padding: '0.5rem 1.5rem', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s'
  }
};

export default PermissionsManagement;
