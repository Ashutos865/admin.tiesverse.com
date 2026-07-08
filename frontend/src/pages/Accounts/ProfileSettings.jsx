import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { getProfile, updateProfile, requestPasswordChange, confirmPasswordChange, uploadImage } from '../../apiClient';
import { Save, RotateCcw, User, Mail, ShieldAlert, Sparkles, Bell, KeyRound, Camera } from 'lucide-react';
import ImageCropper from '../../components/ImageCropper.jsx';

const ProfileSettings = () => {
  const { profile, updateProfileState, applyThemeAndColor } = useContext(AuthContext);
  
  // Local states for form inputs
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [weeklyReports, setWeeklyReports] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(10);
  const [theme, setTheme] = useState('dark');
  const [accentColor, setAccentColor] = useState('#FE7A00');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [cropFile, setCropFile] = useState(null);       // raw file awaiting crop
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = React.useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' });

  // Change-password (email OTP) flow
  const [pwdStep, setPwdStep] = useState('idle');   // 'idle' | 'sent'
  const [pwdOtp, setPwdOtp] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  // Preset color swatches
  const colorPresets = [
    { name: 'Indigo', value: '#4F46E5' },
    { name: 'Orange', value: '#FE7A00' },
    { name: 'Violet', value: '#8B5CF6' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Green', value: '#10B981' },
    { name: 'Red', value: '#EF4444' }
  ];

  // Fetch initial profile values
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      const res = await getProfile();
      if (res && !res.error) {
        setUsername(res.username || '');
        setEmail(res.email || '');
        if (res.profile) {
          setDisplayName(res.profile.display_name || '');
          setBio(res.profile.bio || '');
          setEmailNotifications(res.profile.email_notifications ?? true);
          setPushNotifications(res.profile.push_notifications ?? true);
          setWeeklyReports(res.profile.weekly_reports ?? true);
          setTwoFactorEnabled(res.profile.two_factor_enabled ?? false);
          setSessionTimeout(res.profile.session_timeout ?? 10);
          setTheme(res.profile.theme || 'dark');
          setAccentColor(res.profile.accent_color || '#FE7A00');
          setAvatarUrl(res.profile.avatar_url || '');
        }
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  // Real-time Preview: apply changes to HTML element as user edits
  useEffect(() => {
    if (!loading) {
      applyThemeAndColor({
        theme,
        accent_color: accentColor
      });
    }
  }, [theme, accentColor, loading]);

  // Clean up: on unmount, if changes weren't saved, revert to actual context profile state
  useEffect(() => {
    return () => {
      if (profile) {
        applyThemeAndColor(profile);
      }
    };
  }, [profile]);

  const buildPayload = (extra = {}) => ({
    email,
    profile: {
      display_name: displayName,
      bio,
      email_notifications: emailNotifications,
      push_notifications: pushNotifications,
      weekly_reports: weeklyReports,
      two_factor_enabled: twoFactorEnabled,
      session_timeout: Number(sessionTimeout),
      theme,
      accent_color: accentColor,
      avatar_url: avatarUrl,
      ...extra,
    },
  });

  const sendPwdCode = async () => {
    setPwdBusy(true); setPwdMsg('');
    const res = await requestPasswordChange();
    setPwdBusy(false);
    if (res?.sent) { setPwdStep('sent'); setMaskedEmail(res.email || email); }
    else setPwdMsg(res?.error || 'Could not send the code.');
  };

  const submitPwdChange = async () => {
    if (newPwd.length < 8) { setPwdMsg('Password must be at least 8 characters.'); return; }
    if (newPwd !== confirmPwd) { setPwdMsg('The two passwords do not match.'); return; }
    setPwdBusy(true); setPwdMsg('');
    const res = await confirmPasswordChange(pwdOtp.trim(), newPwd);
    setPwdBusy(false);
    if (res?.detail) {
      setPwdStep('idle'); setPwdOtp(''); setNewPwd(''); setConfirmPwd('');
      setToast({ message: 'Password changed successfully.', type: 'success' });
      setTimeout(() => setToast({ message: '', type: '' }), 4000);
    } else {
      setPwdMsg(res?.error || 'Could not change the password.');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setToast({ message: '', type: '' });

    const res = await updateProfile(buildPayload());
    setSaving(false);

    if (res && !res.error) {
      setToast({ message: 'Settings saved successfully! Controls updated.', type: 'success' });
      // Update global context
      if (res.profile) {
        updateProfileState(res.profile);
      }
      // Clear toast after 4 seconds
      setTimeout(() => setToast({ message: '', type: '' }), 4000);
    } else {
      setToast({ message: res?.error || 'Failed to save settings.', type: 'error' });
    }
  };

  // Pick a photo → open the circular cropper (clears the input so the same file re-selects).
  const pickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (f) setCropFile(f);
    e.target.value = '';
  };

  // Cropped square image → upload to Cloudinary → persist avatar_url immediately.
  const onCropped = async (croppedFile) => {
    setCropFile(null);
    setUploadingPhoto(true);
    setToast({ message: '', type: '' });
    const up = await uploadImage(croppedFile);
    const url = up?.secure_url || up?.url || '';
    if (!url) {
      setUploadingPhoto(false);
      setToast({ message: up?.error || 'Photo upload failed. Please try again.', type: 'error' });
      return;
    }
    setAvatarUrl(url);
    const res = await updateProfile(buildPayload({ avatar_url: url }));
    setUploadingPhoto(false);
    if (res && !res.error) {
      if (res.profile) updateProfileState(res.profile);
      setToast({ message: 'Profile photo updated.', type: 'success' });
    } else {
      setToast({ message: res?.error || 'Photo saved locally — click Save to persist.', type: 'error' });
    }
    setTimeout(() => setToast({ message: '', type: '' }), 4000);
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to revert all changes?')) {
      if (profile) {
        setDisplayName(profile.display_name || '');
        setBio(profile.bio || '');
        setEmailNotifications(profile.email_notifications ?? true);
        setPushNotifications(profile.push_notifications ?? true);
        setWeeklyReports(profile.weekly_reports ?? true);
        setTwoFactorEnabled(profile.two_factor_enabled ?? false);
        setSessionTimeout(profile.session_timeout ?? 10);
        setTheme(profile.theme || 'dark');
        setAccentColor(profile.accent_color || '#FE7A00');
        
        setToast({ message: 'Settings reset to last saved state.', type: 'info' });
        setTimeout(() => setToast({ message: '', type: '' }), 3000);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: '1.2rem' }}>Loading user settings...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0.5rem' }}>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Profile & Preferences Settings</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Configure your administrative credentials, customize application aesthetics, and set notification thresholds.
        </p>
      </div>

      {toast.message && (
        <div style={{
          padding: '1rem',
          borderRadius: 'var(--radius)',
          marginBottom: '1.5rem',
          backgroundColor: toast.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : toast.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          border: `1px solid ${toast.type === 'success' ? '#10B981' : toast.type === 'error' ? '#EF4444' : '#3B82F6'}`,
          color: toast.type === 'success' ? '#10B981' : toast.type === 'error' ? '#EF4444' : '#3B82F6',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          transition: 'var(--transition)'
        }}>
          <span>{toast.message}</span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        
        {/* LEFT COLUMN: PROFILE DATA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <User size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Admin Profile Information</h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => !uploadingPhoto && photoInputRef.current?.click()}
                title="Change photo"
                style={{ position: 'relative', width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'var(--surface-hover)', border: '1px solid var(--border)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: uploadingPhoto ? 'wait' : 'pointer' }}
              >
                {avatarUrl
                  ? <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <User size={30} style={{ color: 'var(--text-muted)' }} />}
                {/* hover / upload overlay */}
                <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: uploadingPhoto ? 1 : 0, transition: 'opacity .15s' }}
                  onMouseEnter={(e) => { if (!uploadingPhoto) e.currentTarget.style.opacity = 1; }}
                  onMouseLeave={(e) => { if (!uploadingPhoto) e.currentTarget.style.opacity = 0; }}>
                  {uploadingPhoto ? '…' : <Camera size={20} />}
                </span>
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Profile photo</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {uploadingPhoto ? 'Uploading…' : 'Shown in the top bar. Click the photo to upload a new one — you can crop it to fit the circle.'}
                </div>
                <button
                  type="button"
                  onClick={() => !uploadingPhoto && photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 600, cursor: uploadingPhoto ? 'not-allowed' : 'pointer' }}
                >
                  <Camera size={14} /> {avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Username (Read-Only)</label>
                <div style={{ ...inputStyle, backgroundColor: 'rgba(255,255,255,0.03)', opacity: 0.7, cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
                  {username}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Display Name</label>
                <input 
                  type="text" 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)} 
                  style={inputStyle} 
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label style={labelStyle}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    style={{ ...inputStyle, paddingLeft: '2.5rem' }} 
                    placeholder="admin@tiesverse.com"
                    required
                  />
                  <Mail size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Biography / Notes</label>
                <textarea 
                  value={bio} 
                  onChange={(e) => setBio(e.target.value)} 
                  style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }} 
                  placeholder="Short notes about your role or bio..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SITE SETTINGS, PREFERENCES, SECURITY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* VISUAL APPEARANCE */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <Sparkles size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Site Appearance</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Dashboard Theme</label>
                <select 
                  value={theme} 
                  onChange={(e) => setTheme(e.target.value)} 
                  style={inputStyle}
                >
                  <option value="dark">Premium Dark</option>
                  <option value="light">Classic Light</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Accent Focus Color</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {colorPresets.map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setAccentColor(preset.value)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: preset.value,
                        border: accentColor.toLowerCase() === preset.value.toLowerCase() ? '3px solid var(--text-main)' : '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        boxShadow: accentColor.toLowerCase() === preset.value.toLowerCase() ? '0 0 8px rgba(255,255,255,0.4)' : 'none'
                      }}
                      title={preset.name}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input 
                    type="color" 
                    value={accentColor} 
                    onChange={(e) => setAccentColor(e.target.value)} 
                    style={{
                      border: 'none',
                      outline: 'none',
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      padding: 0,
                      backgroundColor: 'transparent'
                    }}
                  />
                  <input
                    type="text"
                    value={accentColor.toUpperCase()}
                    onChange={(e) => {
                      if (e.target.value.startsWith('#') && e.target.value.length <= 7) {
                        setAccentColor(e.target.value);
                      }
                    }}
                    style={{ ...inputStyle, width: '120px', textAlign: 'center', fontFamily: 'monospace' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* NOTIFICATIONS & ALERTS */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <Bell size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Alert Notifications</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={checkboxLabelStyle}>
                <input 
                  type="checkbox" 
                  checked={emailNotifications} 
                  onChange={(e) => setEmailNotifications(e.target.checked)} 
                  style={checkboxStyle}
                />
                <div>
                  <div style={{ fontWeight: '500' }}>Email Alerts</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Receive email dispatch updates for event registrations.</div>
                </div>
              </label>

              <label style={checkboxLabelStyle}>
                <input 
                  type="checkbox" 
                  checked={pushNotifications} 
                  onChange={(e) => setPushNotifications(e.target.checked)} 
                  style={checkboxStyle}
                />
                <div>
                  <div style={{ fontWeight: '500' }}>Push Notifications</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Show browser desktop alerts for newly published materials.</div>
                </div>
              </label>

              <label style={checkboxLabelStyle}>
                <input 
                  type="checkbox" 
                  checked={weeklyReports} 
                  onChange={(e) => setWeeklyReports(e.target.checked)} 
                  style={checkboxStyle}
                />
                <div>
                  <div style={{ fontWeight: '500' }}>Weekly Analytics Summary</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compile and send a weekend metric report for Career enrollments.</div>
                </div>
              </label>
            </div>
          </div>

          {/* SECURITY & SESSION */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <ShieldAlert size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Security Settings</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={checkboxLabelStyle}>
                <input 
                  type="checkbox" 
                  checked={twoFactorEnabled} 
                  onChange={(e) => setTwoFactorEnabled(e.target.checked)} 
                  style={checkboxStyle}
                />
                <div>
                  <div style={{ fontWeight: '500' }}>Two-Factor Authentication</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Enforce secondary authenticator token entry on dashboard logs.</div>
                </div>
              </label>

              <div>
                <label style={labelStyle}>Session Invalidation Timeout (minutes)</label>
                <input 
                  type="number" 
                  value={sessionTimeout} 
                  onChange={(e) => setSessionTimeout(e.target.value)} 
                  style={inputStyle}
                  min="5"
                  max="1440"
                />
              </div>
            </div>
          </div>

          {/* CHANGE PASSWORD (email OTP) */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <KeyRound size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Change Password</h2>
            </div>

            {pwdStep === 'idle' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>For your security, we&apos;ll email a 6-digit code to verify it&apos;s you before changing your password.</p>
                <button type="button" onClick={sendPwdCode} disabled={pwdBusy} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                  <Mail size={16} /> {pwdBusy ? 'Sending…' : 'Send code to my email'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>We sent a code to <strong style={{ color: 'var(--text-main)' }}>{maskedEmail}</strong>. Enter it with your new password.</p>
                <div>
                  <label style={labelStyle}>Verification code</label>
                  <input value={pwdOtp} onChange={(e) => setPwdOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6-digit code" style={{ ...inputStyle, letterSpacing: '4px', fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={labelStyle}>New password</label>
                  <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="At least 8 characters" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Confirm new password</label>
                  <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="Re-enter new password" style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button type="button" onClick={submitPwdChange} disabled={pwdBusy} className="btn btn-primary"><KeyRound size={16} /> {pwdBusy ? 'Saving…' : 'Change password'}</button>
                  <button type="button" onClick={sendPwdCode} disabled={pwdBusy} className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }}>Resend code</button>
                  <button type="button" onClick={() => { setPwdStep('idle'); setPwdMsg(''); }} className="btn" style={{ background: 'transparent', color: 'var(--text-muted)' }}>Cancel</button>
                </div>
              </div>
            )}
            {pwdMsg && <div style={{ fontSize: '0.8rem', color: '#EF4444' }}>{pwdMsg}</div>}
          </div>

          {/* ACTION BUTTONS FOOTER */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
            <button 
              type="button" 
              onClick={handleReset} 
              className="btn"
              style={{ border: '1px solid var(--border)', background: 'transparent' }}
            >
              <RotateCcw size={16} />
              Revert Preferences
            </button>
            <button 
              type="submit" 
              disabled={saving} 
              className="btn btn-primary"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

        </div>

      </form>

      {cropFile && <ImageCropper file={cropFile} onCancel={() => setCropFile(null)} onCrop={onCropped} />}
    </div>
  );
};

// Styling structures matching premium dashboard theme
const labelStyle = { 
  display: 'block', 
  marginBottom: '0.5rem', 
  fontWeight: '600', 
  fontSize: '0.85rem', 
  color: 'var(--text-muted)' 
};

const inputStyle = { 
  width: '100%', 
  padding: '0.75rem 1rem', 
  borderRadius: 'var(--radius)', 
  border: '1px solid var(--border)', 
  backgroundColor: 'var(--surface-hover)', 
  color: 'var(--text-main)',
  fontSize: '0.9rem',
  outline: 'none',
  transition: 'var(--transition)'
};

const checkboxLabelStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.75rem',
  padding: '0.75rem',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  transition: 'var(--transition)',
  '&:hover': {
    backgroundColor: 'var(--surface-hover)'
  }
};

const checkboxStyle = {
  marginTop: '0.2rem',
  width: '18px',
  height: '18px',
  borderRadius: '4px',
  accentColor: 'var(--primary)'
};

export default ProfileSettings;
