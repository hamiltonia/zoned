# Zoned - Complete Asset Package

Generated: 2024-11-24

## Icon Files (PNG)

### Standard Sizes
- **icon-48.png** (48×48px) - Small icon, app grids
- **icon-64.png** (64×64px) - About dialogs, preferences
- **icon-128.png** (128×128px) - GNOME Extensions listing thumbnail
- **icon-256.png** (256×256px) - GNOME Extensions detail page
- **icon-512.png** (512×512px) - Social media avatars, high-res displays

### Source
- **icon-correct-layout.svg** (256×256px) - Master SVG, scalable to any size

## Panel Indicator

- **zoned-symbolic.svg** (16×16px) - GNOME Shell panel indicator
  - Uses `currentColor` for automatic theme color adaptation
  - Monochrome, symbolic style per GNOME guidelines
  - Install location: `~/.local/share/gnome-shell/extensions/zoned@yourname/icons/`

## Wordmarks

### Dark Theme (Default)
- **wordmark-aligned.svg** (500×160px) - Master SVG, dark background
- **wordmark-dark-transparent.png** (1000×320px) - PNG export with transparency

### Light Theme
- **wordmark-light.svg** (500×160px) - Light background variant
- **wordmark-light.png** (1000×320px) - PNG export

### Usage
- Dark: Use on dark backgrounds (GitHub dark mode, presentations)
- Light: Use on light backgrounds (documentation sites, print materials)

## GitHub Assets

### README Header
- **github-banner.svg** (1200×400px) - Master banner
- **github-banner.png** (1200×400px) - Rasterized for README

### Social Preview
- **github-social.png** (1280×640px) - Repository social preview image
  - Set in GitHub repo settings under "Social preview"
  - Displays when sharing repository links

## Favicon

- **favicon.ico** - Multi-size favicon (16×16, 32×32, 48×48)
- **favicon-16.png** (16×16px) - Individual PNG
- **favicon-32.png** (32×32px) - Individual PNG

### Usage in HTML
```html
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
```

## File Organization

```
zoned-branding/
├── icons/
│   ├── icon-48.png
│   ├── icon-64.png
│   ├── icon-128.png
│   ├── icon-256.png
│   ├── icon-512.png
│   └── icon-correct-layout.svg (source)
│
├── panel/
│   └── zoned-symbolic.svg
│
├── wordmarks/
│   ├── wordmark-aligned.svg (dark, source)
│   ├── wordmark-light.svg (light, source)
│   ├── wordmark-dark-transparent.png
│   └── wordmark-light.png
│
├── github/
│   ├── github-banner.svg (source)
│   ├── github-banner.png
│   └── github-social.png
│
└── favicon/
    ├── favicon.ico
    ├── favicon-16.png
    └── favicon-32.png
```

## Use Case Reference

| Asset | Where to Use |
|-------|--------------|
| `zoned-symbolic.svg` | GNOME Shell panel (extension) |
| `icon-128.png` | GNOME Extensions listing |
| `icon-256.png` | GNOME Extensions detail page |
| `icon-512.png` | Social media avatars, Open Graph |
| `github-banner.png` | README.md header |
| `github-social.png` | GitHub social preview setting |
| `wordmark-dark-transparent.png` | Dark backgrounds, presentations |
| `wordmark-light.png` | Light backgrounds, documentation |
| `favicon.ico` | Website favicon |

## Design Specifications

### Layout
- **Left column:** Full height zone
- **Middle column:** Full height zone  
- **Right column:** Z brand mark (top) + window (bottom)

### Colors (Dark Theme)
- **Columns:** Slate gradient (#475569 → #1e293b)
- **Z/Text:** Cyan neon (#22d3ee → #06b6d4)
- **Background:** Dark blue-gray (#0f172a)
- **Grid:** Subtle pattern overlay

### Colors (Light Theme)
- **Columns:** Dark slate (#334155 → #1e293b)
- **Z/Text:** Deep cyan (#0891b2 → #0e7490)
- **Background:** Light gray (#f8fafc)

### Typography
- **Font:** Inter, SF Pro Display, system-ui fallback
- **"oned" size:** 70px (dark), 70px (light)
- **Tagline:** 12px uppercase, letter-spacing: 2px
- **Weight:** 700 (bold) for main text, 400 (regular) for tagline

## Technical Notes

- All SVGs use gradients and filters for depth
- PNGs exported with transparency where applicable
- Neon glow effect uses multiple Gaussian blur passes
- Panel indicator uses `currentColor` for theme adaptation
- All assets tested at 1x and 2x display densities

## License

[Your License Here]

## Credits

Design: [Your Name]
Created: November 2024
