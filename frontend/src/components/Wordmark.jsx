// The tiesverse.com brand wordmark, reused across the admin so login / signup /
// sidebar all carry the same identity: ".tiesverse HQ" (the leading dot + "verse"
// in saffron, "ties" in ink). `light` renders on dark/photo backgrounds; `mono`
// forces a single colour (used on the solid saffron signup hero, where the whole
// mark should read white). `hq={false}` drops the HQ badge.
export default function Wordmark({ size = 28, light = false, mono = false, hq = true, style }) {
  const ink = light ? '#fff' : '#1D160D';
  const accent = mono ? ink : '#fe7a00';
  const badgeBorder = light ? 'rgba(255,255,255,.7)' : 'rgba(254,122,0,.55)';
  const badgeColor = light ? '#fff' : '#fe7a00';

  return (
    <span
      style={{
        fontFamily: "'Poppins', 'Hanken Grotesk', system-ui, sans-serif",
        fontWeight: 700,
        letterSpacing: '-0.03em',
        fontSize: size,
        color: ink,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.36em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span>
        <span style={{ color: accent }}>.</span>ties<span style={{ color: accent }}>verse</span>
      </span>
      {hq && (
        <span
          style={{
            fontSize: '0.4em',
            fontWeight: 700,
            letterSpacing: '0.16em',
            textIndent: '0.16em',
            color: badgeColor,
            border: `1.5px solid ${badgeBorder}`,
            borderRadius: '0.5em',
            padding: '0.32em 0.46em',
          }}
        >
          HQ
        </span>
      )}
    </span>
  );
}
