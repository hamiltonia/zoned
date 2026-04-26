# Copilot Instructions for Zoned

## Project Overview

Zoned is a GNOME Shell extension for custom window zone management — layout-based window snapping with keyboard-driven zone cycling, a visual zone editor, and multi-monitor/workspace awareness. It targets GNOME 45+ and works on both X11 and Wayland.

## Build, Lint, and Test

```bash
make build-ts          # Compile TypeScript → JavaScript (Rollup + TS)
make watch-ts          # Watch mode for development
make typecheck         # Type-check without emitting
make lint              # ESLint
make lint-strict       # ESLint with zero warnings (used in CI)
make lint-fix          # ESLint auto-fix
make install           # Build + copy to ~/.local/share/gnome-shell/extensions/
make dev               # lint + install + enable (full dev cycle)
```

There is no automated unit test suite. Testing is two-tier:
- **Tier 1 (CI):** ESLint, metadata validation, GSettings schema compilation, security pattern checks, deprecated API detection
- **Tier 2 (VM):** Functional integration tests run inside a VM via `./scripts/vm test func` (optional, maintainer-only)

## Architecture

The extension follows a **manager pattern** — `extension.ts` is the entry point and orchestrates all managers in `enable()`/`disable()`:

- **LayoutManager** — loads built-in templates + user layouts, manages current layout/zone index, persists to GSettings
- **WindowManager** — positions windows using `Meta.Window` API, converts zone percentages to pixel coordinates
- **SpatialStateManager** — per-workspace, per-monitor layout state keyed as `"connector:workspaceIndex"`
- **KeybindingManager** — registers keybindings with GNOME Shell via `Main.wm.addKeybinding()`
- **TemplateManager** — manages built-in layout templates and migrations

UI components live in `extension/ui/` and include the layout picker dialog (`layoutSwitcher.ts`), full-screen zone editor (`zoneEditor.ts`), panel indicator, and notification system.

Utilities in `extension/utils/` provide signal/resource tracking, conditional debug logging, theme management, and a D-Bus debug interface for test automation.

### Data flow

User layouts are stored as JSON in `~/.config/zoned/layouts.json`. Extension state (current layout, zone index, spatial state map, preferences) is persisted via GSettings (`org.gnome.shell.extensions.zoned`). All managers are instantiated in `enable()` and destroyed with full cleanup in `disable()`.

### Build pipeline

TypeScript source in `extension/` → Rollup with a custom transformer that rewrites `@girs/*` imports to `gi://` runtime imports → output in `build/rollup/` → `make install` copies to the GNOME extensions directory.

## Key Conventions

### Code style

- **TypeScript** with ES2022 modules (ESM); strict mode enabled
- 4-space indentation, single quotes, semicolons required, max line length ~120
- One class per file; keep files under 500 lines when practical
- Private members use underscore prefix: `_settings`, `_onButtonClicked()`
- Constants use `SCREAMING_SNAKE_CASE`
- GSettings keys and GObject signals use `kebab-case`
- Commit format: `type(scope): description` with types `fix/`, `feature/`, `infra/`, `docs/`, `refactor/`

### GNOME extension lifecycle

Every resource allocated in `enable()` **must** be cleaned up in `disable()`. This includes disconnecting all GObject signal handlers, destroying UI actors, and nullifying references. Use the `ResourceTracker` and `SignalTracker` utilities rather than raw `object.connect()` calls — they provide automatic cleanup on `destroy()`.

### Import style

GNOME introspection libraries are imported as `@girs/*` in TypeScript (e.g., `import Gio from '@girs/gio-2.0'`). The Rollup build transforms these to `gi://` at compile time. GNOME Shell internals use `resource:///org/gnome/shell/...` imports.

### Logging

Use the conditional logger from `utils/debug.ts`:
```typescript
import {createLogger} from './utils/debug';
const logger = createLogger('ComponentName');
logger.error('always shown');
logger.info('only when debug-logging GSettings key is enabled');
```

### Code attribution

Never add "Created by Cline/Copilot/AI" comments in source files. Attribution belongs in git commit messages only.

### Deployment safety

Never execute `make install`, `make compile-schema`, or deployment commands without explicit user permission. Testing happens in the VM environment, not locally.
