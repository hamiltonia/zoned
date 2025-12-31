# GitHub Attestations Setup Guide

This document explains what you need to do on GitHub to enable build attestations for your releases.

## What Was Changed

The release workflow (`.github/workflows/release.yml`) has been updated to:

1. **Generate SHA256 checksums** - Creates a `SHA256SUMS` file for manual verification
2. **Create build attestations** - Uses GitHub's cryptographic attestation system
3. **Publish both files** - Attaches both the zip and checksum file to releases

## GitHub Settings Required

### ✅ No Configuration Needed!

Good news: **GitHub attestations work automatically** for public repositories. The workflow changes I made are sufficient.

The required permissions are already configured in the workflow:
```yaml
permissions:
  contents: write          # Already had this
  id-token: write         # Added for attestations
  attestations: write     # Added for attestations
```

### What Happens Automatically

When you push a new tag (e.g., `v1.0.0`), GitHub Actions will:

1. ✓ Build the extension
2. ✓ Generate SHA256 checksum
3. ✓ **Sign the artifact with GitHub's signing infrastructure** (automatic)
4. ✓ **Store the attestation in GitHub's transparency log** (automatic)
5. ✓ Attach both files to the release

No keys to manage, no secrets to configure!

## Testing the Setup

### Before Your Next Release

You can test the workflow without creating a real release:

1. Create a test tag locally:
   ```bash
   git tag v0.0.0-test
   ```

2. Push it to GitHub:
   ```bash
   git push origin v0.0.0-test
   ```

3. Watch the Actions tab to see if it completes successfully

4. Delete the test tag and release:
   ```bash
   # Delete local tag
   git tag -d v0.0.0-test
   
   # Delete remote tag
   git push origin :refs/tags/v0.0.0-test
   
   # Delete the GitHub release via web UI
   ```

### After Your Next Real Release

Verify the attestation works:

```bash
# Download the release zip
cd ~/Downloads

# Verify checksum
sha256sum -c SHA256SUMS

# Verify attestation (requires GitHub CLI)
gh attestation verify zoned-X.Y.Z.zip --owner hamiltonia
```

## What Users See

### In the Release Page

Each release will now have:
- `zoned-X.Y.Z.zip` - The extension package
- `SHA256SUMS` - Checksum file for verification

### In the Attestation System

Users with GitHub CLI can verify:
```bash
$ gh attestation verify zoned-1.0.0.zip --owner hamiltonia

Loaded digest sha256:abc123... for file://zoned-1.0.0.zip
Loaded 1 attestation from GitHub API

✓ Verification succeeded!

sha256:abc123... was attestation found for artifact:
  Issuer: https://token.actions.githubusercontent.com
  Workflow: .github/workflows/release.yml@refs/tags/v1.0.0
  Repository: hamiltonia/zoned
```

This proves:
- The file was built by your official workflow
- It's linked to a specific commit
- It hasn't been tampered with

## How It Works

### The Attestation Process

1. **GitHub Actions builds the artifact** in a secure runner
2. **GitHub generates an OIDC token** proving the workflow's identity
3. **Sigstore cosign signs the artifact** using the OIDC token (keyless)
4. **Attestation stored in Rekor** (Sigstore's transparency log)
5. **Attestation linked to the release** via GitHub API

### Why This Is Secure

- **No keys to manage**: Uses OIDC tokens instead of long-lived keys
- **Transparency log**: All attestations are publicly auditable
- **Tamper-proof**: Cryptographically proves what workflow built what artifact
- **Supply chain security**: Proves the artifact matches the source code

## Troubleshooting

### If Attestation Fails

Check the GitHub Actions logs for errors. Common issues:

1. **Permission error**: The workflow should have `id-token: write` and `attestations: write`
   - ✓ Already configured in our workflow

2. **Private repository**: Attestations require a public repo OR GitHub Enterprise
   - ✓ Your repo is public

3. **Network issues**: GitHub can't reach Sigstore services
   - Rare, retry the workflow

### If Users Can't Verify

Users need:
- GitHub CLI installed: `gh version`
- Authenticated: `gh auth login`
- Recent version: `gh version` (should be v2.49.0+)

They can install it:
```bash
# Debian/Ubuntu
sudo apt install gh

# Arch Linux
sudo pacman -S github-cli

# macOS
brew install gh

# Or download from: https://cli.github.com/
```

## Migration Notes

### Existing Releases

Past releases don't have attestations. This is normal and expected.

To retroactively add verification to old releases:
- **Option 1**: Leave them as-is (most common approach)
- **Option 2**: Manually generate checksums and add to release notes
- **Option 3**: Re-release with new tags (not recommended)

### Future Enhancements

Possible future additions:
- **SLSA provenance levels**: Track build security maturity
- **Multiple artifact types**: If you add other download formats
- **Sigstore signature bundles**: For offline verification

## Resources

- [GitHub Attestations Docs](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds)
- [Sigstore Project](https://www.sigstore.dev/)
- [SLSA Framework](https://slsa.dev/)
- [GitHub CLI Attestation Commands](https://cli.github.com/manual/gh_attestation)

## Summary

✅ **Ready to use** - No GitHub configuration needed, works automatically  
✅ **Secure by default** - Uses GitHub's managed signing infrastructure  
✅ **User-friendly** - Simple verification with `gh attestation verify`  
✅ **Industry standard** - Based on Sigstore, used by major projects  

Your next release will automatically include cryptographic attestations!
