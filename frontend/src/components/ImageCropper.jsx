import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Circular photo cropper. The user drags to reposition and zooms with the slider;
 * the visible circle is exported as a clean square JPEG (so it always fits the
 * round avatar). No dependencies — pure canvas.
 */
const SIZE = 280;       // on-screen viewport (square)
const OUT = 480;        // exported image size (px)

export default function ImageCropper({ file, onCancel, onCrop }) {
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
      const s = Math.max(SIZE / image.width, SIZE / image.height);  // cover
      setImg(image);
      setMinScale(s);
      setScale(s);
      setPos({ x: (SIZE - image.width * s) / 2, y: (SIZE - image.height * s) / 2 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clamp = useCallback((p, s) => {
    if (!img) return p;
    const w = img.width * s, h = img.height * s;
    return { x: Math.min(0, Math.max(SIZE - w, p.x)), y: Math.min(0, Math.max(SIZE - h, p.y)) };
  }, [img]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, pos.x, pos.y, img.width * scale, img.height * scale);
  }, [img, scale, pos]);

  const onScale = (v) => {
    const s = Number(v);
    // keep the viewport centre stable while zooming
    const cx = (SIZE / 2 - pos.x) / scale, cy = (SIZE / 2 - pos.y) / scale;
    setScale(s);
    setPos(clamp({ x: SIZE / 2 - cx * s, y: SIZE / 2 - cy * s }, s));
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
    out.width = OUT; out.height = OUT;
    const ctx = out.getContext('2d');
    const k = OUT / SIZE;
    ctx.drawImage(img, pos.x * k, pos.y * k, img.width * scale * k, img.height * scale * k);
    out.toBlob((blob) => {
      if (blob) onCrop(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 22, width: 'min(360px, 92vw)', textAlign: 'center', boxShadow: '0 30px 80px -30px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#161616', marginBottom: 4 }}>Position your photo</div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 14 }}>Drag to move · use the slider to zoom</div>
        <div style={{ position: 'relative', width: SIZE, height: SIZE, margin: '0 auto', borderRadius: 14, overflow: 'hidden', background: '#f1f1f1', cursor: 'grab', touchAction: 'none' }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}>
          <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block' }} />
          {/* circular guide */}
          <div style={{ position: 'absolute', inset: 0, boxShadow: `0 0 0 ${SIZE}px rgba(0,0,0,.35)`, borderRadius: '50%', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,.9)', borderRadius: '50%', pointerEvents: 'none' }} />
        </div>
        <input type="range" min={minScale} max={minScale * 3.5} step="0.001" value={scale} onChange={(e) => onScale(e.target.value)} style={{ width: SIZE, margin: '16px 0 4px', accentColor: '#fe7a00' }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
          <button type="button" onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', color: '#333', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={confirm} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#fe7a00', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Use photo</button>
        </div>
      </div>
    </div>
  );
}
