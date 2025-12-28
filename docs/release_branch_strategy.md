# Zoned 1.0 Release Strategy Spec

**Version:** 1.0
**Date:** 2025-12-17
**Status:** Pre-implementation

## Overview

This document specifies the branching strategy, release process, and GNOME Extensions submission workflow for reaching Zoned 1.0 and establishing sustainable practices post-release.

---

## Phase 1: Pre-1.0 Branch Consolidation

### Current State

- Active development branch: `initial_dev`
- Target branch: `main`
- Repository: `hamiltonia/zoned`

### Tasks

1. **Merge initial_dev to main**
   - Ensure all tests pass and extension loads cleanly
   - Verify `metadata.json` is complete and accurate
   - Confirm ESLint passes with no errors

2. **Continue final work in initial_dev**
   - Complete remaining MVP features
   - Address any GNOME extension review guideline gaps
   - Final documentation pass

3. **Final merge to main**
   - Squash or merge (developer preference)
   - Tag as `v1.0.0`

4. **Delete initial_dev branch**
   - Work is preserved in main's commit history
   - Eliminates long-lived branch anti-pattern

---

## Phase 2: GNOME Extensions Submission

### Pre-Submission Checklist

- [ ] `metadata.json` complete:
  - [ ] `uuid` follows format: `zoned@hamiltonia.github.io` (or similar)
  - [ ] `version` is integer (start at `1`)
  - [ ] `shell-version` array includes supported versions (e.g., `["47", "48"]`)
  - [ ] `name`, `description`, `url` populated
- [ ] `extension.js` compliance:
  - [ ] No work in constructor
  - [ ] Complete cleanup in `disable()`
  - [ ] No deprecated APIs
  - [ ] ESM imports (GNOME 45+)
- [ ] `prefs.js` compliance:
  - [ ] Uses GTK4 (not GTK3)
  - [ ] Separate context from extension.js (no Clutter/Meta imports)
- [ ] GSettings schema:
  - [ ] Path matches uuid convention
  - [ ] Schema XML is valid
  - [ ] Compiled schema included or build instructions clear
- [ ] No security red flags:
  - [ ] No arbitrary shell command execution
  - [ ] No network calls without justification
  - [ ] No eval() or dynamic code execution

### Submission Process

1. Create zip package containing:
   - `extension.js`
   - `prefs.js`
   - `metadata.json`
   - `stylesheet.css` (if applicable)
   - `schemas/` directory with compiled schemas
   - Any additional modules

2. Upload to https://extensions.gnome.org

3. Wait for review (expect days to weeks)

4. Address reviewer feedback if any -- resubmit as needed

---

## Phase 3: Post-1.0 Branching Strategy

### Branch Structure

| Branch | Purpose | Lifetime | Protected |
|--------|---------|----------|-----------|
| `main` | Stable, releasable code | Permanent | Yes |
| `feature/*` | New feature development | Short-lived | No |
| `fix/*` | Bug fixes | Short-lived | No |

### Workflow Rules

1. **Direct commits to main:** Allowed for trivial fixes (typos, minor tweaks)
2. **Feature branches:** Required for non-trivial changes
3. **External contributions:** Via fork + pull request
4. **Branch naming:** `feature/zone-editor-gui`, `fix/wayland-drag-issue`
5. **Branch cleanup:** Delete after merge

### Tagging Convention

- Format: `v{major}.{minor}.{patch}` (semver)
- Examples: `v1.0.0`, `v1.1.0`, `v1.1.1`
- Note: GitHub tags are independent of EGO integer versions

---

## Phase 4: Ongoing Release Process

### Dual-Track Release Model

```
GitHub Release                    GNOME Extensions (EGO)
--------------                    ----------------------
Fast iteration                    Stable milestones
Manual install by power users     Auto-update for EGO users
Semver tags (v1.1.0)              Integer versions (2, 3, 4...)
Immediate availability            Review queue delay
```

### GitHub Release Process

1. Merge feature/fix branches to main
2. Update version in `metadata.json` (if EGO submission planned)
3. Create GitHub release with semver tag
4. Attach zip artifact for manual installers
5. Write release notes

### EGO Update Process

**Every EGO update requires re-review.** No direct push access.

1. Increment `version` integer in `metadata.json`
2. Create zip package
3. Upload to EGO as new version
4. Enter review queue
5. Approved version replaces previous

### Recommended Cadence

- **GitHub releases:** As needed (bug fixes, features)
- **EGO submissions:** Bundle changes into milestones (monthly or feature-complete batches)

---

## Version Mapping Example

| GitHub Tag | EGO Version | Notes |
|------------|-------------|-------|
| v1.0.0 | 1 | Initial release |
| v1.0.1 | 1 | GitHub-only hotfix |
| v1.1.0 | 2 | Feature update, submitted to EGO |
| v1.1.1 | 2 | GitHub-only fix |
| v1.2.0 | 3 | Next EGO submission |

---

## File Checklist for Submission

```
zoned@hamiltonia.github.io.zip
├── extension.js
├── prefs.js
├── metadata.json
├── stylesheet.css
├── schemas/
│   ├── org.gnome.shell.extensions.zoned.gschema.xml
│   └── gschemas.compiled
└── [additional modules as needed]
```

---

## References

- GNOME Extensions Review Guidelines: https://gjs.guide/extensions/review-guidelines/review-guidelines.html
- GNOME Shell Extension Documentation: https://gjs.guide/extensions/
- EGO Upload: https://extensions.gnome.org/upload/

---

## Implementation Status

**Date Implemented:** 2025-12-25
**Status:** ✅ Complete - Ready for v1.0.0 release

### What Was Implemented

1. ✅ **GitHub Actions CI Pipeline** (`.github/workflows/ci.yml`)
   - Runs on every push to main and all PRs
   - ESLint strict mode (no warnings allowed)
   - Metadata validation
   - GSettings schema compilation
   - Security checks (eval, Function constructor, etc.)
   - Deprecated API detection
   - Required file validation

2. ✅ **GitHub Actions Release Pipeline** (`.github/workflows/release.yml`)
   - Triggers on git tags matching `v*.*.*`
   - Reuses CI checks
   - Builds extension zip via `make build`
   - Creates **draft** GitHub releases (review before publishing)
   - Auto-generates release notes
   - Attaches zip artifact

3. ✅ **2-Tier Testing Strategy** (documented in CONTRIBUTING.md)
   - **Tier 1 (Automated):** CI checks via GitHub Actions
   - **Tier 2 (Integration):** VM-based tests run by maintainers
   - Contributors don't need VM access
   - Maintainers run `make vm-test-func` and `make vm-test-mem` before releases

4. ✅ **Branch Protection** (to be configured on GitHub)
   - Require PRs before merging
   - Require CI checks to pass
   - No direct pushes to main
   - Include administrators (maintainer follows same rules)

5. ✅ **Version Management**
   - Added `version: 1` to metadata.json
   - GitHub tags use semver: `v1.0.0`, `v1.0.1`, `v1.1.0`
   - EGO version is integer: 1, 2, 3
   - Multiple GitHub releases can share same EGO version

### Workflow Examples (Implemented)

#### Initial Release (v1.0.0)
```bash
# 1. Merge initial_dev to main (squash merge)
git checkout main
git merge initial_dev --squash
git commit -m "Merge initial_dev: Complete MVP 1.0"

# 2. Push to main
git push origin main

# 3. Run full VM test suite
make vm-test-func PRESET=full
make vm-test-mem PRESET=standard

# 4. Tag release
git tag -a v1.0.0 -m "Release 1.0.0 - Initial public release"
git push origin v1.0.0

# 5. GitHub Actions automatically:
#    - Runs CI checks
#    - Builds zip
#    - Creates DRAFT release

# 6. Review draft release on GitHub
#    - Edit release notes if needed
#    - Publish when ready

# 7. Download zip, submit to extensions.gnome.org
```

#### Bug Fix (v1.0.1 - GitHub only)
```bash
# 1. Create fix branch
git checkout -b fix/panel-icon-hidpi
# ... make changes ...
git commit -m "Fix panel icon size on HiDPI displays"
git push origin fix/panel-icon-hidpi

# 2. Open PR, wait for CI to pass, merge

# 3. Tag patch release (no version bump in metadata.json)
git tag -a v1.0.1 -m "Fix HiDPI panel icon rendering"
git push origin v1.0.1

# 4. Publish GitHub release
# 5. Skip EGO submission (minor fix, not worth review queue)
```

#### Feature Release (v1.1.0 - Submit to EGO)
```bash
# 1. Develop feature in branch, merge via PR

# 2. Bump version in metadata.json
# Change "version": 1 to "version": 2

# 3. Commit version bump
git add extension/metadata.json
git commit -m "Bump version to 2 for EGO submission"
git push origin main

# 4. Run VM tests, tag release
git tag -a v1.1.0 -m "Release 1.1.0 - Multi-monitor improvements"
git push origin v1.1.0

# 5. Publish GitHub release

# 6. Submit to EGO (version 2)
#    - Download zip from GitHub release
#    - Upload to extensions.gnome.org
#    - Wait for review
```

### Branch Protection Setup Instructions

**On GitHub.com:**
1. Go to Settings → Branches
2. Add rule for `main` branch
3. Configure:
   - ☑️ Require a pull request before merging
   - ☑️ Require status checks to pass before merging
     - Select: `lint-and-validate` (from CI workflow)
   - ☑️ Require branches to be up to date before merging
   - ☐ Require approvals: 0 (solo maintainer can self-merge)
   - ☑️ Include administrators (maintainer follows same rules)
   - ☐ Allow force pushes: No
   - ☐ Allow deletions: No
4. Save changes

**Result:**
- All changes to main must go through PRs
- CI must pass before merging
- Even you (as owner) must use PR workflow
- You can merge your own PRs (no waiting for approvals)

### Pre-Release Checklist Template

Before tagging any release, verify:

```bash
# 1. Automated checks pass
make lint-strict

# 2. VM functional tests (15-30 min)
make vm-test-func PRESET=full

# 3. VM memory tests (10-20 min) 
make vm-test-mem PRESET=standard

# 4. Manual smoke test in VM
# - Load extension
# - Test core workflows
# - Check for UI issues
# - Verify no errors in logs

# 5. Update CHANGELOG.md with release notes

# 6. If submitting to EGO, bump version integer in metadata.json

# 7. Tag and push
git tag -a vX.Y.Z -m "Release X.Y.Z - Brief description"
git push origin vX.Y.Z

# 8. Review draft release on GitHub, publish when ready

# 9. If new EGO version, submit zip to extensions.gnome.org
```

### Files Modified for Implementation

- `extension/metadata.json` - Added `version: 1`
- `.github/workflows/ci.yml` - Created CI pipeline
- `.github/workflows/release.yml` - Created release pipeline
- `CONTRIBUTING.md` - Added 2-tier testing documentation
- `docs/release_branch_strategy.md` - This implementation section

---

## Agent Instructions

When executing this spec:

1. Start with Phase 1 branch consolidation
2. Run pre-submission checklist systematically -- verify each item
3. Do not skip security review items
4. Create zip using correct structure before any upload steps
5. Document any deviations or blockers encountered
