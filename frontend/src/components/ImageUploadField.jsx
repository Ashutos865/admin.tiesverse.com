import { Image } from 'lucide-react';
import { resolveImg } from '../utils/img';

// Reusable image field: a URL text input + direct Cloudinary upload, plus an
// optional "Library" browse (shown only when onBrowse is provided). The chosen
// secure_url is written back through onChange, so it stores in the model's
// *_url field exactly like a typed URL would.
//
// Props:
//   label, name, value, onChange, placeholder, required  — like a text field
//   onFile(file)   — called with the picked File; caller uploads + sets value
//   onBrowse()     — optional; opens a library picker
//   uploading      — bool; disables the upload button while in flight

const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box',
};

const btnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
    borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.8)', fontFamily: 'inherit',
};

export default function ImageUploadField({
    label, name, value, onChange, placeholder, required, onFile, onBrowse, uploading,
}) {
    return (
        <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' }}>
                {label}
            </label>
            <input
                type="text" name={name} value={value || ''} onChange={onChange}
                placeholder={placeholder} required={required} style={inputStyle}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                <label style={{ ...btnStyle, opacity: uploading ? 0.6 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
                    <Image size={14} /> {uploading ? 'Uploading…' : 'Upload'}
                    <input
                        type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; }}
                    />
                </label>
                {onBrowse && (
                    <button type="button" onClick={onBrowse} style={btnStyle}>Library</button>
                )}
                {value && (
                    <img
                        src={resolveImg(value)} alt="" onError={(e) => { e.target.style.display = 'none'; }}
                        style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                )}
            </div>
        </div>
    );
}
