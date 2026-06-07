# UI Guidelines & Design Tokens

To ensure a unified, premium user experience, all developers must adhere to the following design tokens and layout conventions when contributing to the Tiesverse Admin Panel.

## 1. CSS Variable Architecture

Do **not** use hardcoded hexadecimal colors or strict RGBA variants (e.g., `#FF6B00` or `rgba(255,107,0,0.1)`) inside JavaScript components or inline styles. The dashboard relies on dynamic `.light` class toggling to support real-time user preference updates.

### Core Variables (`index.css`)
- `--primary`: The user's selected accent color (e.g., Orange, Blue, Green).
- `--primary-hover`: A darkened variant of the primary color used for button hover states.
- `--bg-color`: The absolute lowest base layer (`#0A0A0A` for Dark, `#F5F5F7` for Light).
- `--surface`: The standard card background (`#141414` for Dark, `#FFFFFF` for Light).
- `--surface-hover`: Slightly elevated surface for hover interactions.
- `--text-main`: High emphasis text.
- `--text-muted`: Low emphasis, secondary text.
- `--border`: Standardized container borders (`rgba(255, 255, 255, 0.08)` for Dark).

## 2. Dynamic Opacities with `color-mix()`

When you need an opaque version of the primary color (for tags, highlights, or subtle hover backgrounds), do not convert it to an RGB string. Instead, use the modern CSS `color-mix()` function in `srgb` space.

**Example: 10% Opacity Background**
```css
/* DO THIS */
background: 'color-mix(in srgb, var(--primary) 10%, transparent)'

/* DO NOT DO THIS */
background: 'rgba(255,107,0,0.1)'
```

## 3. Dark Mode Palette Specifics
The default Tiesverse theme relies on "Deep Black" aesthetics to look premium, rather than muddy slates.
- **Base Background:** `#0A0A0A`
- **Surface Level 1:** `#141414`
- **Surface Level 2 (Hover):** `#1E1E1E`
- **Standard Border:** `rgba(255,255,255,0.08)`

## 4. Modal Over Split-Panel
When creating CRUD (Create, Read, Update, Delete) interfaces for data management:
- Display the existing data using a **responsive, full-width CSS grid** (`repeat(auto-fill, minmax(300px, 1fr))`).
- Do **not** use a 50/50 split panel (list on left, form on right) as this degrades legibility on smaller screens.
- Use a centered **Modal Overlay** for "Add New" and "Edit" forms to maximize focus and available space.
