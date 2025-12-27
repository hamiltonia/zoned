# VM Setup Improvements

This document summarizes the improvements made to the VM setup workflow to address issues with IP discovery, virtiofs configuration, and multi-VM management.

## Issues Addressed

### 1. IP Discovery Problems (New VM)
**Problem**: Could not discover VM IP even with qemu-guest-agent installed
- The script checked for package installation but not if service was running
- No fallback mechanisms or helpful error messages

**Solution**:
- Added `vm_check_qemu_agent()` to verify service is active
- Added `vm_install_qemu_agent()` with distro-specific installation
- Improved error messages with Option 1 (manual IP) and Option 2 (install agent)
- Automatic offer to install agent when SSH works but IP discovery fails
- Better guidance on where to find IP manually in the VM

### 2. Virtiofs Setup Confusion (New VM)
**Problem**: Setup workflow was fragmented and confusing
- No clear guidance on host-side vs guest-side configuration
- Error messages assumed user understood libvirt/virtiofs architecture

**Solution**:
- Created "virtiofs Setup Wizard" with clear step-by-step flow
- Automatic host-side detection and configuration offer
- Integrated vm-virtiofs-migrate into setup flow with confirmation
- Clear progress indicators (Step 1/2/3/4)
- Better error messages with actionable suggestions
- Automatic fallback suggestion to SPICE when virtiofs unavailable

### 3. Existing VM Mount Discovery
**Problem**: Could not re-discover shared folders after VM restart
- Cache stored static paths that became invalid
- SPICE mounts have dynamic paths that change
- virtiofs mounts lost if VM rebooted without fstab entry

**Solution**:
- Implemented smart re-discovery in `vm_check_existing_mount()`
- For virtiofs: Check if mounted, if in fstab but not mounted, attempt auto-mount
- For SPICE: Always re-scan GVFS mounts dynamically (using `find` with `$(id -u)`)
- Clear instructions when mount can't be found
- Automatic sudo mount attempt for virtiofs when fstab entry exists

### 4. Single-VM Cache Limitation
**Problem**: Could only work with one VM at a time
- Single `.vm-cache` file for entire project
- Switching between test VMs required full re-setup

**Solution**:
- Implemented VM profile system in `.vm-profiles/` directory
- Each VM gets its own profile file (e.g., `fedora-40.profile`)
- Active profile tracked via symlink
- New `vm-profile` script for managing profiles:
  - `vm-profile list` - Show all configured VMs
  - `vm-profile switch <name>` - Switch active VM instantly
  - `vm-profile info` - Show current/specific profile details
- Legacy `.vm-cache` automatically migrated to profile system
- Profile names derived from VM domain names (sanitized)

## New Features

### Multi-VM Profile Management
```bash
# Setup multiple VMs
make vm-setup  # Creates fedora-40 profile
make vm-setup  # Creates ubuntu-2404 profile

# Switch between them
scripts/vm-profile list
scripts/vm-profile switch fedora-40
make vm-dev  # Deploys to Fedora

scripts/vm-profile switch ubuntu-2404
make vm-dev  # Deploys to Ubuntu
```

### Improved Error Messages
All error messages now include:
- Clear explanation of what went wrong
- Why it matters
- Specific actionable steps to fix it
- Alternative approaches when primary method fails

### Better Diagnostics
- `vm_virtiofs_diagnose()` checks kernel version, module availability
- Specific suggestions based on what's detected
- Color-coded output for better readability

## Files Modified

1. **scripts/lib/vm-detect.sh**
   - Added qemu-guest-agent installation functions
   - Improved IP discovery with better fallbacks
   - Implemented profile system (list, read, write, switch)
   - Enhanced mount re-discovery logic
   - Better error messages throughout

2. **scripts/lib/vm-virtiofs-setup.sh**
   - Created step-by-step setup wizard
   - Integrated host-side configuration check
   - Improved error handling and diagnostics
   - Better user guidance and confirmations

3. **scripts/vm-profile** (NEW)
   - Profile management CLI tool
   - Commands: list, switch, info, help
   - User-friendly interface for multi-VM workflows

4. **docs/vm-profiles.md** (NEW)
   - Complete documentation of profile system
   - Usage examples and workflows
   - Migration information

5. **.gitignore**
   - Added `.vm-profiles/` to ignored files

## Backward Compatibility

- Legacy `.vm-cache` files automatically migrated to profiles
- Old scripts continue to work via compatibility functions
- No breaking changes to existing workflows

## Testing Recommendations

Test the following scenarios:
1. **Fresh VM Setup**: Run on brand new VM without qemu-guest-agent
2. **Existing VM**: Test with VM that was previously configured
3. **Multiple VMs**: Set up 2-3 VMs and test profile switching
4. **virtiofs New**: Fresh virtiofs setup on unconfigured VM
5. **virtiofs Existing**: VM with virtiofs but unmounted after reboot
6. **SPICE**: Test SPICE mount discovery after VM restart
7. **Profile Migration**: Test with existing `.vm-cache` file

## Benefits

1. **Reduced Friction**: New users get clear guidance at every step
2. **Better Recovery**: Existing setups automatically repair themselves
3. **Multi-VM Testing**: Easy to maintain and switch between test VMs
4. **Self-Documenting**: Error messages teach users about the system
5. **Resilient**: Handles edge cases and provides fallbacks
