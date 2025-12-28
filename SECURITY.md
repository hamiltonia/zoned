# Security Policy

## Supported Versions

We actively support the latest release of Zoned. Security updates are provided for:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

We recommend always using the latest version available through GNOME Extensions or GitHub releases.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in Zoned, please report it privately using one of the following methods:

### Preferred: GitHub Security Advisories

1. Go to the [Security Advisories page](https://github.com/hamiltonia/zoned/security/advisories)
2. Click "Report a vulnerability"
3. Fill out the form with details about the vulnerability
4. Submit the report

This method allows us to collaborate privately on a fix before public disclosure.

### Alternative: Direct Email

If you cannot use GitHub Security Advisories, you can email security reports to:

**[Your email will be added here during repository setup]**

### What to Include

Please include the following information in your report:

- **Description**: A clear description of the vulnerability
- **Impact**: What an attacker could do by exploiting this vulnerability
- **Reproduction**: Step-by-step instructions to reproduce the vulnerability
- **GNOME Shell version**: Which version(s) are affected
- **Zoned version**: Which version(s) are affected
- **Suggested fix**: If you have ideas for how to fix it (optional)

### Response Timeline

We aim to:

- **Acknowledge** your report within **48 hours**
- **Provide an initial assessment** within **7 days**
- **Release a fix** for confirmed vulnerabilities within **30 days** (for critical issues, sooner)

### Disclosure Policy

We follow **coordinated disclosure**:

1. You report the vulnerability privately
2. We confirm and develop a fix
3. We release the fix in a new version
4. We publicly disclose the vulnerability details (crediting you if desired)

### Scope

Security issues in Zoned typically involve:

- **Code execution**: Arbitrary command execution through the extension
- **Data exposure**: Leaking sensitive user data or system information
- **Privilege escalation**: Gaining elevated permissions through the extension
- **Denial of service**: Crashes or hangs that affect GNOME Shell stability

**Out of scope**:
- Bugs that don't have security implications
- Issues in GNOME Shell itself (report to GNOME project)
- Issues in third-party extensions (report to their maintainers)

## Security Best Practices for Users

To use Zoned securely:

1. **Install from trusted sources**: Use GNOME Extensions (extensions.gnome.org) or official GitHub releases
2. **Keep updated**: Enable automatic updates or check for new versions regularly
3. **Review permissions**: Zoned only requires standard GNOME Shell extension permissions
4. **Report issues**: If something seems suspicious, report it

## Security Best Practices for Contributors

If you're contributing code to Zoned:

1. **No arbitrary command execution**: Never use `eval()`, `Function()`, or `GLib.spawn_command_line_sync()` with user input
2. **Validate all inputs**: Validate and sanitize any user-provided data
3. **Handle errors gracefully**: Don't expose stack traces or system information in UI
4. **Follow secure coding guidelines**: See [CONTRIBUTING.md](CONTRIBUTING.md) for code standards
5. **Test thoroughly**: Include security considerations in your testing

## Known Security Considerations

### Extension Permissions

Zoned has access to:
- **Window management**: Can move, resize, and track windows
- **Keyboard input**: Can register global keyboard shortcuts
- **Settings storage**: Can read/write extension settings via GSettings

These are standard permissions for window management extensions.

### Data Storage

Zoned stores:
- **Custom layouts**: Saved in `~/.config/zoned/layouts.json` (JSON format)
- **Settings**: Saved in GSettings (`~/.local/share/glib-2.0/schemas/`)

No sensitive data (passwords, tokens, etc.) is stored or transmitted.

### Network Access

Zoned **does not make any network requests**. All functionality is local.

## Credits

We appreciate responsible disclosure and will credit security researchers (with permission) in:

- Security advisories
- Release notes
- CHANGELOG.md

Thank you for helping keep Zoned and the GNOME community secure!
