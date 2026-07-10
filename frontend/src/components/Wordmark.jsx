// The tiesverse.com brand wordmark, reused across the admin so login / signup /
// sidebar all carry the same identity: ".tiesverse" + an "HQ" chip (leading dot +
// "verse" in saffron, "ties" in ink). `light` renders on dark/photo backgrounds;
// `mono` forces a single colour (used on the solid saffron signup hero, where the
// whole mark should read white). `hq={false}` drops the HQ chip.
//
// Every span carries explicit inline styles (colour, size, weight, case) so broad
// descendant rules like `.portal-sidebar-brand span` can never restyle the mark.
export default function Wordmark({ size = 28, light = false, mono = false, hq = true, style }) {
  const ink = light ? '#fff' : '#1D160D';
  const accent = mono ? ink : '#fe7a00';

  const reset = {
    fontFamily: "'Poppins', 'Hanken Grotesk', system-ui, sans-serif",
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '1em',
    letterSpacing: '-0.03em',
    lineHeight: 1,
  };

  return (
    <span
      style={{
        ...reset,
        fontSize: size,
        color: ink,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.42em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span style={{ ...reset, color: ink }}>
        <span style={{ ...reset, color: accent }}>.</span>
        ties
        <span style={{ ...reset, color: accent }}>verse</span>
      </span>
      {hq && (
        <span
          style={{
            ...reset,
            fontSize: '0.34em',
            fontWeight: 800,
            letterSpacing: '0.18em',
            textIndent: '0.18em',
            textTransform: 'uppercase',
            padding: '0.42em 0.62em',
            borderRadius: '0.55em',
            color: light ? '#fff' : '#fe7a00',
            background: light ? 'rgba(255,255,255,0.16)' : 'rgba(254,122,0,0.12)',
          }}
        >
          HQ
        </span>
      )}
    </span>
  );
}
