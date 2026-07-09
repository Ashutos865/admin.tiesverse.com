import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Rectangular photo cropper with a configurable aspect ratio. The user drags to
 * reposition and zooms with the slider; the visible box is exported as a JPEG
 * File (the upload endpoint converts to WebP). No dependencies — pure canvas.
 *
 * Props: file, aspect (w/h, default 16/10), onCancel, onCrop(File), label
 */
export default function RectCropper({ file, aspect = 16 / 10, onCancel, onCrop, label = 'Position your image' }) {
  // On-screen crop box, capped to 360px on the longer side.
  const W = aspect >= 1 ? 360 : Math.round(360 * aspect);
  const H = aspect >= 1 ? Math.round(360 / aspect) : 360;
  const OUT_W = 1200;
  const OUT_H = Math.round(OUT_W / aspect);

  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const s = Math.max(W / image.width, H / image.height);   // cover
      setImg(image);
      setMinScale(s);
      setScale(s);
      setPos({ x: (W - image.width * s) / 2, y: (H - image.height * s) / 2 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, W, H]);

  const clamp = useCallback((p, s) => {
    if (!img) return p;
    const w = img.width * s, h = img.height * s;
    return { x: Math.min(0, Math.max(W - w, p.x)), y: Math.min(0, Math.max(H - h, p.y)) };
  }, [img, W, H]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, pos.x, pos.y, img.width * scale, img.height * scale);
  }, [img, scale, pos, W, H]);

  const onScale = (v) => {
    const s = Number(v);
    const cx = (W / 2 - pos.x) / scale, cy = (H / 2 - pos.y) / scale;
    setScale(s);
    setPos(clamp({ x: W / 2 - cx * s, y: H / 2 - cy * s }, s));
  };

  const start = (e) => { const p = e.touches ? e.touches[0] : e; drag.current = { sx: p.clientX, sy: p.clientY, ox: pos.x, oy: pos.y }; };
  const move = (e) => {
    if (!drag.current) return;
    const p = e.touches ? e.touches[0] : e;
    const { sx, sy, ox, oy } = drag.current;
    setPos(clamp({ x: ox + (p.clientX - sx), y: oy + (p.clientY - sy) }, scale));
  };
  const end = () => { drag.current = null; };

  const confirm = () => {
    const out = document.createElement('canvas');
    out.width = OUT_W; out.height = OUT_H;
    const ctx = out.getContext('2d');
    const k = OUT_W / W;
    ctx.drawImage(img, pos.x * k, pos.y * k, img.width * scale * k, img.height * scale * k);
    out.toBlob((blob) => {
      if (blob) onCrop(new File([blob], 'image.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 3000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 22, width: 'min(440px, 94vw)', textAlign: 'center', boxShadow: '0 30px 80px -30px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#161616', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 14 }}>Drag to move · slider to zoom · exported at {OUT_W}×{OUT_H}</div>
        <div style={{ position: 'relative', width: W, height: H, margin: '0 auto', borderRadius: 10, overflow: 'hidden', background: '#f1f1f1', cursor: 'grab', touchAction: 'none' }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}>
          <canvas ref={canvasRef} width={W} height={H} style={{ display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,.9)', borderRadius: 10, pointerEvents: 'none', boxShadow: '0 0 0 1px rgba(0,0,0,.1) inset' }} />
        </div>
        <input type="range" min={minScale} max={minScale * 3.5} step="0.001" value={scale} onChange={(e) => onScale(e.target.value)} style={{ width: W, margin: '16px 0 4px', accentColor: '#fe7a00' }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
          <button type="button" onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', color: '#333', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={confirm} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#fe7a00', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Use image</button>
        </div>
      </div>
    </div>
  );
}
