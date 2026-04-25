# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Core managers & extension lifecycle | fenster | LayoutManager, WindowManager, SpatialStateManager, KeybindingManager, TemplateManager, extension.ts enable/disable |
| UI components & styling | verbal | Zone editor, layout switcher, panel indicator, zone overlay, notifications, stylesheet.css, Adwaita/libadwaita |
| Type system & build pipeline | edie | TypeScript types, `@girs/*` imports, Rollup config, tsconfig, strict mode, declaration files |
| Testing & quality | hockney | VM integration tests, D-Bus debug interface, memory leak detection, test scripts |
| Documentation | mcmanus | README, CONTRIBUTING, DEVELOPMENT, CHANGELOG, docs/, inline documentation |
| Security & CI | baer | ESLint config, GitHub Actions workflows, security patterns, GSettings schema validation, release pipeline |
| Multi-monitor & display | kobayashi | SpatialStateManager, monitor connectors, workspace management, X11/Wayland compatibility |
| Architecture & scope | keaton | Cross-cutting decisions, API design, scope changes, code review, trade-offs |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | keaton |
| `squad:fenster` | GNOME API / manager issues | fenster |
| `squad:verbal` | UI/UX issues | verbal |
| `squad:edie` | Type system / build issues | edie |
| `squad:hockney` | Test coverage / quality issues | hockney |
| `squad:mcmanus` | Documentation issues | mcmanus |
| `squad:baer` | Security / CI issues | baer |
| `squad:kobayashi` | Multi-monitor / Wayland issues | kobayashi |
| `bug` | Triage by severity (P0–P3), assign to relevant member | keaton |
| `enhancement` | Evaluate scope and feasibility, assign to relevant member | keaton |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, **keaton** (Lead) triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.
5. Bug reports use P0–P3 priority labels per MAINTAINERS.md (P0 = critical, P3 = cosmetic).

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. keaton handles all `squad` (base label) triage.
8. **GNOME lifecycle safety** — any change touching `enable()`/`disable()` must be reviewed by fenster for resource cleanup compliance.
