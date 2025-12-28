# Changelog

All notable changes to the Zoned GNOME Shell extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Dynamic version management system
- Development build auto-marking with timestamps
- Version display in preferences UI
- Interactive version bump and tagging script
- GitHub issue templates (bug report and feature request forms)
- Pull request template with comprehensive checklist
- Changelog generation script (`scripts/changelog-helper`)
- Makefile targets for changelog generation (`make changelog`, `make changelog-since`)

### Changed
- Updated extension description from "FancyZones-style window management" to "Advanced window management for GNOME"
- Improved README.md with embedded demo videos and clearer structure
- Enhanced DEVELOPMENT.md with proper git workflow and attribution guidelines
- Updated CONTRIBUTING.md with references to GitHub templates and proper commit format
- Refined .clinerules to clarify commit attribution belongs in body, not title

### Documentation
- VM development documentation
- Testing strategy documentation
- Memory debugging guides
- SECURITY.md with GitHub Security Advisories workflow
- CODE_OF_CONDUCT.md (Contributor Covenant 2.1)
- MAINTAINERS.md with release process and maintainer guidelines
- Added 6 demo videos to README.md showcasing key features
- Updated all documentation to remove unnecessary FancyZones references
- Standardized AI agent references in development guides

## [0.9.0] - 2025-12-27

### Added
- Initial project setup with comprehensive documentation
- 9 default window layouts (Halves, Thirds, Quarters, Grid, Columns, etc.)
- Layout-based zone cycling system with keyboard shortcuts
- Layout picker UI (Super+grave) with visual previews
- Window minimize/maximize shortcuts (Super+Up/Down)
- Zone navigation with Super+Left/Right
- State persistence via GSettings
- Custom layout support via JSON configuration
- Multi-monitor support
- Visual feedback via notifications
- Development build version tracking
- VM development environment support
- Comprehensive testing framework

### Documentation
- Architecture overview and design patterns
- Development setup guide with VM support
- Component design specifications
- Layout system API reference
- Keyboard shortcuts reference
- Memory debugging and testing guides
- VM setup and profiles documentation

### Known Issues
- Layout picker may need keyboard layout adjustments for backtick key
- Wayland requires logout/login to reload extension during development

---

## Version History Format

### [Version] - YYYY-MM-DD

#### Added
- New features

#### Changed
- Changes to existing functionality

#### Deprecated
- Features that will be removed in future versions

#### Removed
- Features removed in this version

#### Fixed
- Bug fixes

#### Security
- Security improvements or fixes

---

*Note: This project is in active development. Version 0.1.0 has not been released yet.*
