# Squad Team

> zoned — GNOME Shell extension for custom window zone management

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| keaton | Lead / Architect | [charter](agents/keaton/charter.md) | active |
| fenster | GNOME/GJS Specialist | [charter](agents/fenster/charter.md) | active |
| edie | TypeScript Engineer | [charter](agents/edie/charter.md) | active |
| hockney | Tester | [charter](agents/hockney/charter.md) | active |
| verbal | UI/UX Developer | [charter](agents/verbal/charter.md) | active |
| mcmanus | Documentation | [charter](agents/mcmanus/charter.md) | active |
| baer | Security & CI | [charter](agents/baer/charter.md) | active |
| kobayashi | Multi-monitor & Wayland | [charter](agents/kobayashi/charter.md) | active |

## Project Context

- **Project:** zoned
- **Owner:** @hamiltonia
- **Stack:** TypeScript (strict mode, ESM), GNOME Shell 45+, GJS, Rollup, ESLint
- **Description:** Layout-based window snapping with keyboard-driven zone cycling, visual zone editor, and multi-monitor/workspace awareness
- **Distribution:** GNOME Extensions (.zip), GitHub Releases
- **Build:** `make build-ts` (Rollup + TS), `make lint-strict` (CI), `make install` (local deploy)
- **Testing:** Tier 1 (CI: ESLint, metadata, schema, security), Tier 2 (VM: functional integration via `./scripts/vm test func`)
- **Created:** 2026-04-24
