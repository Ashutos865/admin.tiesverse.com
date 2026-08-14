# TIES Admin — Design System ("Swap-inspired" dark)

A bold, high-contrast dark system: one near-black canvas, one glossy accent
gradient, tight Swiss display type, generous rounding, and a single white pill
CTA. Adapted from the SwapIt verification reference, re-skinned to TIES orange.

Reference feel: **dark + confident + one loud accent.** Everything else is quiet
so the accent and the type do the talking.

---

## 1. Color tokens

```
--bg            #0A0A0B   /* app canvas, near-black */
--surface       #141416   /* cards, inputs */
--surface-2     #1C1C20   /* elevated (OTP cells, chips) */
--border        rgba(255,255,255,.08)
--border-strong rgba(255,255,255,.16)

--text          #FFFFFF
--text-muted    rgba(255,255,255,.55)
--text-dim      rgba(255,255,255,.38)

--accent        #FE7A00           /* TIES orange */
--accent-press  #E76E00
--accent-soft   rgba(254,122,0,.14)

/* glossy hero gradient (replaces SwapIt's red) */
--hero-grad: radial-gradient(120% 120% at 30% 0%, #FF9A3D 0%, #FE7A00 42%, #E85D00 100%);
--hero-sheen: linear-gradient(115deg, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 38%);

/* CTA */
--cta-bg        #FFFFFF
--cta-text      #0A0A0B

/* semantic */
--ok #22C55E   --warn #F59E0B   --bad #F87171
```

Light theme stays the app default elsewhere; this dark system is for **auth /
signup / OTP** first, then rolls outward. Tokens above map to the same CSS var
names the app already uses (`--bg`, `--surface`, `--text`, `--border`, `--accent`)
so components can adopt it by swapping the token values, not the markup.

---

## 2. Typography

- **Display** (hero headline): system grotesque, weight **800**, tracking **-0.03em**,
  line-height **0.98**. Stack: `"Helvetica Neue", Helvetica, Arial, -apple-system, sans-serif`.
  Size `clamp(30px, 8vw, 42px)`. Sentence-per-line, period after each phrase
  ("One tap. Any asset."). Balance with `text-wrap: balance`.
- **Heading** (section, e.g. "Enter Verification Code"): weight **700**, size 22px, white.
- **Body**: weight 400, 15px, `--text-muted`, line-height 1.5.
- **Label**: weight 600, 13px, `--text-muted`, letter-spacing .02em.
- **Mono-ish data** (masked email, codes): tabular, slightly spaced.

Type carries the page. Keep everything else restrained.

---

## 3. Radius & spacing

```
--r-hero  28px    /* the gradient hero card */
--r-card  20px
--r-input 14px
--r-cell  16px    /* OTP digit box */
--r-pill  999px   /* CTA + chips */
```
Spacing scale: 4 · 8 · 12 · 16 · 20 · 24 · 32. Screen padding 20–24px. Generous
vertical rhythm between blocks (24–32px).

---

## 4. Components

**Hero card** — `--hero-grad` + a `--hero-sheen` overlay, radius `--r-hero`,
padding 28px, min-height ~46vh. Wordmark top-left (`.ties`), display headline,
one muted sub-line. The sheen is a single diagonal light streak (no busy noise).

**Section head** — 22px/700 white heading + 15px muted subtitle.

**Masked email chip** — pill, `--surface-2`, `--border`, muted text, e.g.
`Us****9675@gmail.com` (show first 2 + last 4 of the local part).

**OTP segmented input** — N cells (6), each `--surface-2`, `--r-cell`, ~56×62px,
1px `--border`; **focused cell** gets a 2px `--accent` ring + `--accent-soft` glow.
Digit is 22px/700 white. Auto-advance on type, backspace to previous, full paste
support, numeric keyboard on mobile.

**Timer + resend** — small pill timer (`0:36`, `--surface-2`, `--text-dim`) left;
"Didn't get a code? **Resend**" right (muted text, bold white/accent link). Resend
disabled until the timer hits 0.

**CTA (primary)** — full-width **white pill** (`--cta-bg`/`--cta-text`), height 56px,
weight 700, radius `--r-pill`. Pressed: slight scale + dim. Disabled: 40% opacity.
This is the ONE loud button per screen.

**Text input** — `--surface`, `--r-input`, 1px `--border`, white text, `--text-dim`
placeholder, 14px padding; focus → `--border-strong` + faint accent ring.

**Avatar upload** — 72px circle, dashed `--border-strong`, tap to pick; preview
fills the circle (photos already convert to WebP server-side).

---

## 5. Motion

- Enter: hero fades/rises 8px (220ms ease). Steps cross-fade.
- OTP cell fill: 90ms pop (scale 1→1.04→1).
- CTA press: scale .98. Respect `prefers-reduced-motion`.

---

## 6. Rollout order

1. **OTP / signup** (this doc's first target) — `PublicSignup`.
2. **Auth** — Login, Forgot/Reset password.
3. **App shell** — sidebar + top bar re-skinned to the dark tokens.
4. **Content pages** — dashboards, tables, forms adopt `--surface`/`--border`
   tokens (mostly a token swap since components already read CSS vars).

Do it token-first: change the token *values*, let components inherit. Only the
auth/OTP screens get the bespoke hero + segmented treatment.

---

## 7. Pages added since this document — August 2026

New surfaces built after the rollout above. All of them read the CSS variables
(`--surface`, `--outline-variant`, `--text-main`, `--text-muted`,
`--primary`) rather than hardcoding colour, so a token change reaches them.

| Page | Route | Who sees it |
|------|-------|-------------|
| Research Page | `/tiesverse/research-page` | Org-wide staff |
| Report editor | inside Research Page (pencil on a report) | Org-wide staff |
| Portal Access | `/webinar/access` | Superadmins (leads reach it by URL) |
| Analytics tab | inside a webinar or workshop | Anyone with `view` |

**Charts are plain SVG.** The Analytics donut and bars are drawn with `<circle>`
`stroke-dasharray` and sized `<span>`s — no charting library, so nothing extra
ships and there is no second theme system to keep in step with these tokens.

**Read-only is a real state, not a hidden button.** A member with only `view`
sees the Details form inside a disabled `<fieldset>` with a line naming who to
ask, instead of editable fields whose save the server would refuse.

**Money and access get a confirm.** Refunding and revoking both name the person
and the amount or scope before acting, because neither can be undone from here.
