# macOS/Parallels Migration Guide

This document describes the changes made to support macOS with Parallels Desktop while maintaining backward compatibility with Linux/GNOME Boxes.

## Changes Made

### 1. Makefile - macOS `sed` Compatibility

**Issue**: macOS and Linux have different `sed -i` syntax
- Linux: `sed -i 's/pattern/replacement/' file`
- macOS: `sed -i '' 's/pattern/replacement/' file`

**Solution**: Added OS detection at the top of Makefile:
```makefile
# Detect OS for sed compatibility
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    SED_INPLACE = sed -i ''
else
    SED_INPLACE = sed -i
endif
```

Updated all `sed -i` calls to use `$(SED_INPLACE)` in:
- `install` target
- `install-dev` target
- `zip` target

### 2. scripts/vm-setup - Parallels Mount Detection

**Issue**: Script only detected GNOME Boxes GVFS mounts

**Solution**: Added multi-hypervisor mount detection with priority order:
1. **Parallels** (`/media/psf/zoned`) - checked first
2. **Legacy GNOME Boxes** (`/run/user/1000/spice-client-folder`) - fallback
3. **GVFS WebDAV** (`/run/user/1000/gvfs/dav*`) - final fallback

Enhanced error messages to show instructions for both hypervisors.

### 3. scripts/init-vm-config - Smart OS Detection

**Issue**: Hardcoded GNOME Boxes mount point

**Solution**: Added OS detection to set appropriate defaults:
```bash
if [[ "$(uname)" == "Darwin" ]]; then
    VM_MOUNT_TYPE="parallels"
    VM_SPICE_MOUNT="/media/psf/zoned"
else
    VM_MOUNT_TYPE="gnome-boxes"
    VM_SPICE_MOUNT="/run/user/1000/spice-client-folder"
fi
```

Updated next steps to show hypervisor-specific instructions.

## Architecture Comparison

### GNOME Boxes (Linux)
```
Host: ~/GitHub/zoned/
   ↓ (SPICE WebDAV)
VM: /run/user/1000/gvfs/dav+sd:host=Spice%20client%20folder.../
   ↓ (symlink)
VM: ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me/
```

### Parallels Desktop (macOS)
```
Host: ~/GitHub/zoned/
   ↓ (Parallels Shared Folders - prl_fs kernel module)
VM: /media/psf/zoned/
   ↓ (symlink)  
VM: ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me/
```

## Benefits of Parallels on macOS

1. **Cleaner mount paths**: `/media/psf/zoned` vs long GVFS URL
2. **Better performance**: Native kernel module vs WebDAV protocol
3. **More reliable**: Doesn't require manual mounting in file manager
4. **Tighter integration**: Better clipboard, drag-drop, etc.
5. **Same workflow**: All existing scripts work identically

## Testing Checklist

- [ ] Run `make vm-init` on macOS
- [ ] Verify it detects "Parallels Desktop" 
- [ ] Verify it sets mount to `/media/psf/zoned`
- [ ] Run `make vm-setup`
- [ ] Verify it finds Parallels mount successfully
- [ ] Verify symlink created correctly
- [ ] Test `make vm-install`
- [ ] Test `make vm-logs`
- [ ] Test editing a file and reloading in VM
- [ ] Verify no regression on Linux/GNOME Boxes

## Backward Compatibility

All changes maintain full backward compatibility:
- Linux hosts automatically use GNOME Boxes paths
- macOS hosts automatically use Parallels paths
- No breaking changes to existing workflows
- No changes needed to other scripts (vm-install, vm-logs)

## Next Steps

1. **Run vm-init**:
   ```bash
   make vm-init
   ```
   
2. **Verify shared folder in VM**:
   ```bash
   # In VM terminal:
   ls /media/psf/zoned/extension
   # Should show: extension.js, metadata.json, etc.
   ```

3. **Run vm-setup**:
   ```bash
   make vm-setup
   ```

4. **Test workflow**:
   ```bash
   # Edit a file
   code ~/GitHub/zoned/extension/extension.js
   
   # Watch logs
   make vm-logs
   
   # In VM: Alt+F2 → r → Enter
   ```

## Troubleshooting

### Parallels shared folder not appearing in VM

1. **Check Parallels Tools installed**:
   ```bash
   # In VM:
   lsmod | grep prl_fs
   # Should show the kernel module
   ```

2. **Check sharing enabled**:
   - Parallels Desktop → VM Configuration → Options → Sharing
   - "Share Mac folders with Linux" should be checked
   - Custom folder should show: `/Users/hamiltonia/GitHub/zoned` → `zoned`

3. **Verify mount**:
   ```bash
   # In VM:
   mount | grep prl_fs
   # Should show: prl_fs on /media/psf type prl_fs
   ```

### Makefile sed errors on macOS

If you see errors like `sed: 1: "file": invalid command code`, you may need to:
1. Update Makefile (already done in this migration)
2. Or install GNU sed: `brew install gnu-sed`

## Summary

The migration is complete! You can now use the same familiar workflow on macOS with Parallels as you had on Linux with GNOME Boxes, with potentially better performance and reliability.

**Last Updated**: 2024-11-26
