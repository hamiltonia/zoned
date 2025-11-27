# Zoned Memory Bank

**⚠️ Important:** Start with [STATUS.md](STATUS.md) for current implementation state before diving into other docs.

Documentation and knowledge base for the Zoned GNOME Shell Extension project.

## Purpose

This memory bank serves as:
- **Architecture documentation** - Design decisions and technical specifications
- **Development guide** - Setup, testing, and debugging workflows
- **API reference** - Profile system, configuration, and extension APIs
- **Knowledge transfer** - Context for contributors and future maintainers

## Structure

```
memory/
├── README.md                       # This file
├── architecture/                   # Design and architecture
│   ├── overview.md                # High-level architecture
│   ├── hammerspoon-translation.md # Mapping from Hammerspoon to GNOME
│   └── component-design.md        # Detailed component breakdown
├── development/                    # Development guides
│   ├── setup.md                   # Environment setup
│   ├── testing.md                 # Testing strategies
│   ├── debugging.md               # Debugging GNOME extensions
│   └── gnome-apis.md              # Key GNOME/GJS API references
└── api-reference/                  # API documentation
    ├── profiles.md                # Profile system specification
    ├── configuration.md           # Config file format
    └── keybindings.md             # Keyboard shortcut reference
```

## Quick Reference

### For Active Development
1. **Start here:** `/ROADMAP.md` - Current development plan and next steps
2. **Check status:** `STATUS.md` - What's implemented, what's evolving, what's planned
3. **Architecture:** Review the Profile vs Layout model in ROADMAP.md

### For Contributors
1. Start with `STATUS.md` - understand current implementation state
2. Read `/ROADMAP.md` - see active development phases and roadmap
3. Read `architecture/hammerspoon-translation.md` - see how Hammerspoon concepts map to GNOME
4. Follow `development/setup.md` - get your dev environment ready
5. Reference `api-reference/` - understand the profile and config systems

### For Maintainers
- `architecture/component-design.md` - detailed component interactions
- `development/debugging.md` - troubleshooting and logging
- `api-reference/profiles.md` - profile system internals

## Philosophy

This is a **documentation-first** project. The memory bank was created before the code to ensure:
- Clear architectural vision
- Well-documented decisions
- Easy onboarding for contributors
- Maintainable codebase

## Related Documentation

- `/ROADMAP.md` - **Development roadmap and implementation plan**
- `STATUS.md` - **Current implementation status (start here!)**
- `/docs/` - User-facing documentation (installation, usage, customization)
- `/README.md` - Project overview and quick start
- `/CONTRIBUTING.md` - Contribution guidelines

---
*Created: 2025-11-21*
*Last Updated: 2025-11-26*
