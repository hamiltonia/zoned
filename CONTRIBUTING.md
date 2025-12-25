# Contributing to Zoned

Thank you for your interest in contributing to Zoned! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

## How to Contribute

### Reporting Bugs

Before creating a bug report:
1. Check the [existing issues](https://github.com/hamiltonia/zoned/issues)
2. Verify you're using a supported GNOME Shell version (49+)
3. Try with extension disabled to rule out conflicts

When creating a bug report, include:
- GNOME Shell version (`gnome-shell --version`)
- Linux distribution and version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs from `journalctl -f /usr/bin/gnome-shell`
- Screenshots if applicable

### Suggesting Features

Feature requests are welcome! Please:
1. Check existing issues/discussions first
2. Clearly describe the use case
3. Explain how it fits with Zoned's philosophy
4. Consider implementation complexity

### Pull Requests

#### Before Starting

1. **Fork the repository**
2. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Discuss major changes** via an issue first

#### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/zoned.git
cd zoned

# Install extension for development
make install
make compile-schema
make enable

# View logs while developing
make logs
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed instructions.

#### Code Style

**JavaScript:**
- Use 4 spaces for indentation
- Use ES6+ features where appropriate
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Use meaningful variable names

**Example:**
```javascript
/**
 * Move window to specified zone
 * @param {Meta.Window} window - The window to move
 * @param {Object} zone - Zone definition with x, y, w, h
 * @returns {boolean} True if successful
 */
moveWindowToZone(window, zone) {
    // Implementation
}
```

**File Organization:**
- One class per file
- Group related functions together
- Keep files focused and manageable (<500 lines)

#### Commit Messages

Follow conventional commits format:

```
type(scope): brief description

Longer description if needed.

Fixes #123
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style/formatting
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(layouts): add sixths layout layout

fix(keybindings): resolve conflict with GNOME shortcuts

docs(readme): update installation instructions
```

#### Testing

Zoned uses a **two-tier testing approach** to balance automation with real-world validation:

##### Tier 1: Automated CI (Required for All PRs)

All pull requests **must pass** automated checks before merging:
- ✅ ESLint code quality checks
- ✅ Metadata validation
- ✅ GSettings schema compilation
- ✅ Security pattern checks
- ✅ File structure validation

These checks run automatically via GitHub Actions when you open a PR.

##### Tier 2: Integration Testing (Run by Maintainers)

For significant code changes, maintainers will run VM-based integration tests before merging. **Contributors do not need VM access** - maintainers handle this testing.

**If you want to run integration tests yourself** (optional but appreciated):
- See [docs/vm-setup-guide.md](docs/vm-setup-guide.md) for VM configuration
- Run: `make vm-test-func PRESET=quick` for functional tests
- Run: `make vm-test-mem PRESET=quick` for memory leak checks
- Include test results in your PR description

##### What to Test Manually

Before submitting your PR, please test:

1. **Basic functionality:**
   - Zone cycling works
   - Layout picker displays correctly
   - State persists across sessions
   - No errors in logs

2. **Edge cases:**
   - No focused window
   - Layout with single zone
   - Multi-monitor setups (if available)
   - Wayland and/or X11 (whichever you use)

3. **Check for regressions:**
   - Existing features still work
   - No new warnings/errors in logs

4. **Verify documentation is updated** if applicable

#### Pull Request Process

1. **Update documentation** if needed
2. **Update CHANGELOG.md** under [Unreleased]
3. **Ensure all tests pass**
4. **Request review** from maintainers
5. **Address feedback** promptly

**PR Title Format:**
```
[Type] Brief description

Examples:
[Feature] Add vertical split layout
[Fix] Correct zone boundary calculation
[Docs] Improve layout customization guide
```

**PR Description Template:**
```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Changes
- Change 1
- Change 2

## Testing
How was this tested?

## Screenshots
If applicable

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Tested on GNOME Shell 49+
- [ ] No new warnings/errors in logs
```

### Documentation Contributions

Documentation improvements are always welcome!

**Areas needing help:**
- User guides with screenshots
- Video tutorials
- Translations (future)
- API documentation improvements
- Architecture diagrams

**Documentation locations:**
- Developer docs: `docs/`
- README.md for overview

### Layout Contributions

New layout designs are welcome!

**Guidelines:**
- Layout must solve a real use case
- Provide clear use case description
- Include ASCII visualization
- Test with various window types
- Consider different screen sizes

**Example submission:**
```json
{
    "id": "coding_triple",
    "name": "Coding Triple (Editor/Terminal/Browser)",
    "use_case": "IDE on left, terminal top-right, browser bottom-right",
    "zones": [
        {"name": "Editor", "x": 0, "y": 0, "w": 0.6, "h": 1},
        {"name": "Terminal", "x": 0.6, "y": 0, "w": 0.4, "h": 0.5},
        {"name": "Browser", "x": 0.6, "y": 0.5, "w": 0.4, "h": 0.5}
    ]
}
```

## Development Workflow

### Local Development

```bash
# Install extension
make install
make compile-schema

# Enable extension
make enable

# Make changes to extension/ files

# Reload (X11 only)
make reload

# Or disable/enable (Wayland)
make disable && make enable

# View logs
make logs

# Uninstall when done
make uninstall
```

### Debugging

**Looking Glass (GNOME Shell Console):**
```
1. Alt+F2
2. Type: lg
3. Press Enter
4. Use Evaluator tab to inspect objects
```

**Common debugging commands:**
```javascript
// In Looking Glass Evaluator:
log('Debug message')
global.log('Also works')

// View extension object
let ext = imports.misc.extensionUtils.getCurrentExtension()
ext
```

**Log viewing:**
```bash
# Follow logs
journalctl -f -o cat /usr/bin/gnome-shell | grep -i zoned

# Recent errors
journalctl -b -o cat /usr/bin/gnome-shell | grep -i error
```

### Component Changes

When modifying components:

1. **LayoutManager changes:**
   - Update layout validation if needed
   - Test with custom layouts
   - Verify state persistence

2. **WindowManager changes:**
   - Test on multiple monitors
   - Verify edge cases (no window, minimized, etc.)
   - Check different screen resolutions

3. **UI changes:**
   - Test keyboard navigation
   - Verify visual appearance
   - Check with different themes

4. **GSettings schema changes:**
   - Increment schema version if breaking
   - Provide migration if needed
   - Update documentation

## Project Structure

```
zoned/
├── extension/          # Extension source code
│   ├── extension.js
│   ├── layoutManager.js
│   ├── windowManager.js
│   ├── keybindingManager.js
│   ├── ui/
│   ├── schemas/
│   └── config/
├── docs/               # Documentation
├── scripts/            # Development scripts
├── README.md
├── LICENSE
├── CONTRIBUTING.md
└── Makefile
```

## Resources

### GNOME Shell Extension Development
- [GJS Guide](https://gjs.guide/)
- [GNOME Shell Source](https://gitlab.gnome.org/GNOME/gnome-shell)
- [Extension Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)

### Project Documentation
- [Architecture](docs/architecture.md) - Component overview
- [Technical Specs](docs/technical-specs.md) - Edge layouts, data structures
- [Coding Patterns](docs/coding-patterns.md) - Code style guide
- [Keybindings](docs/keybindings.md) - Keyboard shortcuts

### Community
- [GitHub Issues](https://github.com/hamiltonia/zoned/issues)
- [GitHub Discussions](https://github.com/hamiltonia/zoned/discussions)

## Release Process

(For maintainers)

1. Update version in `metadata.json`
2. Update `CHANGELOG.md` with release date
3. Create git tag: `git tag v0.1.0`
4. Push tag: `git push origin v0.1.0`
5. Create GitHub release
6. Build extension zip: `make zip`
7. Upload to extensions.gnome.org (when ready)

## Questions?

- Open a [Discussion](https://github.com/hamiltonia/zoned/discussions)
- Check existing [Issues](https://github.com/hamiltonia/zoned/issues)
- Review [Documentation](docs/)

## License

By contributing, you agree that your contributions will be licensed under the GNU General Public License v3.0.

---

Thank you for contributing to Zoned! 🎉
