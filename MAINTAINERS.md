# Maintainer Guide

This document provides guidance for Zoned project maintainers on managing releases, reviewing contributions, and maintaining project health.

## Maintainers

- **@hamiltonia** - Project creator and primary maintainer

## Responsibilities

### Code Review

**Pull Request Review Checklist:**

- [ ] Code follows project style guidelines (see [docs/coding-patterns.md](docs/coding-patterns.md))
- [ ] Commit messages follow conventional commits format
- [ ] Attribution in commit body, not title
- [ ] Changes are tested (contributor confirms manual testing)
- [ ] Documentation updated if applicable
- [ ] CHANGELOG.md updated under [Unreleased] section
- [ ] No new warnings or errors introduced
- [ ] Code doesn't introduce memory leaks (for significant changes, run VM tests)
- [ ] Backward compatibility maintained (or migration path provided)

**Review Process:**

1. **Initial Review** (within 48 hours)
   - Acknowledge the PR
   - Run automated CI checks
   - Request changes if needed

2. **Testing** (for significant changes)
   - Deploy to VM test environment
   - Run integration tests: `make vm-test-func PRESET=quick`
   - Run memory tests if applicable: `make vm-test-mem PRESET=quick`
   - Test on both X11 and Wayland if relevant

3. **Approval & Merge**
   - Ensure all CI checks pass
   - Squash and merge (use PR title as commit message)
   - Add attribution to commit body
   - Delete feature branch after merge

### Issue Management

**Issue Triage:**

1. **Bug Reports** - Label as `bug`, assign priority (`P0`-`P3`)
   - `P0` - Critical: Extension crashes, data loss
   - `P1` - High: Major feature broken
   - `P2` - Medium: Minor feature issue
   - `P3` - Low: Enhancement, cosmetic

2. **Feature Requests** - Label as `enhancement`, discuss feasibility
   - Evaluate against project philosophy
   - Consider implementation complexity
   - Get community feedback if significant change

3. **Questions** - Label as `question`, redirect to Discussions if appropriate

4. **Duplicate/Invalid** - Close with explanation and link to original

**Response Time Goals:**
- Critical bugs (P0): Same day
- High priority (P1): Within 24 hours
- Medium/Low (P2-P3): Within 1 week
- Feature requests: Within 1 week

### Release Management

**Version Numbering:**

Follow Semantic Versioning (SemVer):
- **Major** (1.0.0): Breaking changes, major rewrites
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes, backward compatible

**Release Process:**

1. **Prepare Release Branch**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b release/v0.2.0
   ```

2. **Generate Changelog**
   ```bash
   # Generate changelog for all commits since last release
   make changelog-since TAG=v0.1.0
   
   # Review and edit CHANGELOG.md
   # Move [Unreleased] items to new version section
   # Add release date
   ```

3. **Update Version**
   - Update version in `extension/metadata.json`
   - Verify shell-version compatibility list

4. **Create Release Commit**
   ```bash
   git add extension/metadata.json CHANGELOG.md
   git commit -m "Release v0.2.0

   Modified by Cline"
   ```

5. **Create Git Tag**
   ```bash
   git tag -a v0.2.0 -m "Release v0.2.0

   Highlights:
   - Feature 1
   - Feature 2
   - Bug fix 1"
   ```

6. **Build Distribution**
   ```bash
   make zip
   # Creates zoned@hamiltonia.me.zip
   ```

7. **Push Release**
   ```bash
   git push origin release/v0.2.0
   git push origin v0.2.0
   ```

8. **Create GitHub Release**
   - Go to GitHub Releases
   - Create new release from tag
   - Use changelog content for release notes
   - Attach `zoned@hamiltonia.me.zip`
   - Mark as pre-release if appropriate

9. **Merge Release Branch**
   ```bash
   # Create PR: release/v0.2.0 → main
   # After approval and merge:
   git checkout main
   git pull origin main
   git branch -d release/v0.2.0
   ```

10. **Post-Release**
    - Announce in Discussions
    - Update project website if applicable
    - Monitor for critical issues

**Extension Repository (Future):**

When ready to publish to extensions.gnome.org:
1. Create account on extensions.gnome.org
2. Upload `zoned@hamiltonia.me.zip`
3. Fill out extension description
4. Submit for review
5. Address review feedback
6. Monitor extension reviews/ratings

### Security

**Security Issue Response:**

1. **Acknowledge** receipt within 24 hours
2. **Assess** severity and impact
3. **Fix** in private branch if critical
4. **Disclose** via GitHub Security Advisory
5. **Release** patch version ASAP
6. **Notify** users via GitHub release notes

**Reviewing Security:**

- Check for command injection in shell commands
- Verify proper input sanitization
- Review file path handling for traversal issues
- Check for unsafe use of `eval()` or `Function()`
- Verify proper error handling (no sensitive data in logs)

### Testing Infrastructure

**VM Test Environment:**

Maintainers should have a configured VM for integration testing:

```bash
# Setup VM (one-time)
make vm-init
make vm-setup

# Run tests before releases
make vm-test-func PRESET=full        # Full functional test suite
make vm-test-mem PRESET=full         # Full memory leak tests

# Quick tests for PR review
make vm-test-func PRESET=quick       # Core functionality only
make vm-test-mem PRESET=quick        # Basic memory checks
```

**Test Coverage Goals:**

- All core features have integration tests
- Memory leak tests cover major UI components
- Edge cases (no window, multi-monitor, etc.) are tested
- Both X11 and Wayland paths tested

### Documentation Maintenance

**Documentation Review:**

- Keep README.md concise and user-focused
- Ensure DEVELOPMENT.md stays current with development workflow
- Update docs/architecture.md when components change
- Maintain accuracy in technical documentation
- Fix broken links and outdated screenshots

**Documentation PRs:**

- Welcome all documentation improvements
- Grammar/typo fixes can be merged quickly
- Major content changes may need discussion
- Ensure examples still work

### Community Management

**Fostering Community:**

- Respond to discussions promptly
- Encourage first-time contributors
- Thank contributors publicly
- Highlight community contributions in release notes
- Maintain welcoming, inclusive environment

**Handling Conflicts:**

- Enforce Code of Conduct
- Address inappropriate behavior quickly and privately when possible
- Escalate to GitHub Support if needed
- Document incidents

**Recognizing Contributors:**

- Thank contributors in PR comments
- Mention contributors in CHANGELOG.md
- Consider GitHub Discussions "show and tell" for showcasing contributions

### Automation and CI/CD

**GitHub Actions:**

Monitor and maintain workflows in `.github/workflows/`:
- Ensure CI checks remain relevant
- Update actions to latest versions
- Fix failing checks promptly
- Add new checks as project grows

**Future Automation Opportunities:**

- Automated release notes generation (using changelog-helper)
- Automated version bumping
- Automated extension.gnome.org uploads
- Automated rollback on critical failures

## Tools and Scripts

### Changelog Management

```bash
# Generate changelog since specific tag
make changelog-since TAG=v0.1.0

# Generate full changelog
make changelog

# Generate JSON format
./scripts/changelog-helper --format=json --since=v0.1.0
```

### Development Scripts

```bash
# VM scripts
./scripts/vm setup           # Setup VM environment
./scripts/vm logs            # Watch VM logs
./scripts/vm test func       # Run functional tests
./scripts/vm test mem        # Run memory tests

# Utilities
./scripts/util/clean-install    # Clean local install
./scripts/util/vm-clean-install # Clean VM install
```

## Maintenance Schedule

**Weekly:**
- Review new issues and PRs
- Triage bug reports
- Respond to discussions

**Monthly:**
- Review documentation for accuracy
- Check for dependency updates
- Review and update roadmap
- Analyze extension metrics (once on extensions.gnome.org)

**Quarterly:**
- Review test coverage
- Update development tools
- Clean up stale issues/PRs
- Review project goals and direction

**Before Each GNOME Release:**
- Test with beta/RC versions
- Update shell-version in metadata.json
- Prepare compatibility patch if needed

## Decision Making

**Minor Changes:**
- Maintainer can merge directly

**Moderate Changes:**
- Seek feedback from community
- Allow 24-48 hours for discussion

**Major Changes:**
- Create RFC (Request for Comments) in Discussions
- Allow at least 1 week for feedback
- Document decision rationale

**Breaking Changes:**
- Require broad consensus
- Provide migration guide
- Bump major version
- Announce well in advance

## Maintainer Resources

### Useful Commands

```bash
# Check extension on VM
ssh vm-user@vm-ip 'gnome-extensions info zoned@hamiltonia.me'

# Restart GNOME Shell on VM (X11)
ssh vm-user@vm-ip 'DISPLAY=:0 dbus-send --type=method_call --dest=org.gnome.Shell /org/gnome/Shell org.gnome.Shell.Eval string:"global.reexec_self()"'

# View VM logs
ssh vm-user@vm-ip 'journalctl -f -o cat /usr/bin/gnome-shell | grep -i zoned'

# Check for memory leaks in VM
make vm-test-mem PRESET=full
```

### External Resources

- [GNOME Extensions Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
- [GJS Style Guide](https://gjs.guide/guides/gjs/style-guide.html)
- [GNOME Shell Extensions Discourse](https://discourse.gnome.org/c/platform/extensions/14)
- [Semantic Versioning](https://semver.org/)

## Questions?

For maintainer-specific questions, contact @hamiltonia directly or open a private discussion.

---

*This guide is a living document. Maintainers should update it as processes evolve.*
