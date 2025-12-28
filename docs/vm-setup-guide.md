# VM Development Setup Guide

Complete step-by-step guide to set up VM-based development for Zoned GNOME Shell Extension.

**Why VM Development?** Fedora 43+ removed X11 support, meaning GNOME Shell reload requires logout/login (~15-30 seconds). Using a VM with X11 allows quick reload with `Alt+F2 → r` (~2-3 seconds).

**Supported Host OSes:** Fedora, Ubuntu, Arch Linux  
**Supported Guest OSes:** Fedora 42+, Ubuntu 22.04/24.04 LTS, Arch Linux

**Time Required:** 20-30 minutes for initial setup

---

## Table of Contents

1. [Quick Start (Recommended)](#quick-start-recommended)
2. [Host Prerequisites](#host-prerequisites)
3. [Create VM in GNOME Boxes](#create-vm-in-gnome-boxes)
4. [Configure virtiofs File Sharing](#configure-virtiofs-file-sharing)
5. [Initialize VM Development](#initialize-vm-development)
6. [Daily Development Workflow](#daily-development-workflow)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start (Recommended)

**The Simple Workflow:**

```
1. Install GNOME Boxes and virtualization tools
   ↓
2. Create VM in GNOME Boxes (30 seconds, GUI)
   ↓
3. Install OS (Fedora 42 recommended)
   ↓
4. make vm-virtiofs-migrate (automated virtiofs setup)
   ↓
5. make vm-setup (SSH + verify virtiofs)
   ↓
6. make vm-install (deploy & test)
```

This guide walks you through each step.

---

## Host Prerequisites

Install GNOME Boxes and virtualization tools on your host machine.

<details>
<summary><b>Fedora Host</b></summary>

```bash
sudo dnf install gnome-boxes virt-manager libvirt virtiofsd
sudo systemctl enable --now libvirtd
sudo usermod -a -G libvirt $USER
# Log out and log back in for group changes
```
</details>

<details>
<summary><b>Ubuntu Host</b></summary>

```bash
sudo apt-get update
sudo apt-get install gnome-boxes virt-manager libvirt-daemon-system \
  libvirt-clients qemu-kvm virtiofsd
sudo systemctl enable --now libvirtd
sudo usermod -a -G libvirt $USER
# Log out and log back in for group changes
```
</details>

<details>
<summary><b>Arch Linux Host</b></summary>

```bash
sudo pacman -S gnome-boxes virt-manager libvirt qemu-full virtiofsd dnsmasq
sudo systemctl enable --now libvirtd
sudo usermod -a -G libvirt $USER
# Log out and log back in for group changes
```
</details>

**Verify KVM support:**
```bash
lsmod | grep kvm
# Should show: kvm_intel or kvm_amd
```

---

## Create VM in GNOME Boxes

### 1. Download OS ISO

**Fedora 42 (Recommended):**
```bash
cd ~/Downloads
wget https://download.fedoraproject.org/pub/fedora/linux/releases/42/Workstation/x86_64/iso/Fedora-Workstation-Live-x86_64-42-1.6.iso
```

Or download from: https://getfedora.org/en/workstation/download/

**Why Fedora 42?**
- Last version with X11 available by default
- GNOME 47 (current stable)
- Best for extension development

**Alternatives:**
- Ubuntu 24.04 LTS - GNOME 46, X11 built-in
- Arch Linux - Rolling release, latest GNOME

### 2. Create VM

1. Open GNOME Boxes: `gnome-boxes`
2. Click **"New"** (+ button)
3. Select **"Operating System Image File"**
4. Select your downloaded ISO
5. Click **"Customize"** before creating:
   - **Memory:** 4096 MB (4 GB) minimum
   - **Maximum Disk Size:** 20 GB minimum
   - **CPUs:** 2 cores
6. Click **"Create"**

### 3. Install OS

1. Wait for VM to boot from ISO
2. Click **"Install to Hard Drive"**
3. Follow installation wizard:
   - Create user (use same username as host for convenience)
   - Make user administrator
4. Complete installation and reboot

### 4. Install X11 Support

**In the VM:**

<details>
<summary><b>Fedora Guest</b></summary>

```bash
sudo dnf install -y gnome-session-xsession openssh-server
sudo systemctl enable --now sshd
sudo reboot
```

After reboot:
- Log out
- Click gear icon at bottom right
- Select **"GNOME on Xorg"**
- Log back in
</details>

<details>
<summary><b>Ubuntu Guest</b></summary>

```bash
sudo apt-get update
sudo apt-get install -y openssh-server
sudo systemctl enable --now ssh
sudo reboot
```

After reboot:
- X11 session available by default
- Select **"GNOME on Xorg"** at login if needed
</details>

<details>
<summary><b>Arch Linux Guest</b></summary>

```bash
sudo pacman -S gnome-session openssh
sudo systemctl enable --now sshd
sudo reboot
```

After reboot:
- Select **"GNOME on Xorg"** at login
</details>

**Verify X11 is active:**
```bash
echo $XDG_SESSION_TYPE
# Should output: x11
```

**Test GNOME Shell reload:**
- Press `Alt+F2`
- Type: `r`
- Press Enter
- Shell should reload in ~2 seconds

---

## Configure virtiofs File Sharing

virtiofs provides fast, kernel-level file sharing between host and VM. This is the recommended method.

### On Host

**Navigate to zoned directory:**
```bash
cd ~/GitHub/zoned
```

**Run automated virtiofs migration:**
```bash
make vm-virtiofs-migrate
# Or: ./scripts/vm-virtiofs-migrate
```

**The script will:**
1. List available VMs and let you select one
2. Shut down the VM (if running)
3. Back up current VM configuration
4. Add virtiofs configuration for sharing the zoned directory
5. **Automatically fix file permissions** (chmod -R a+rX on shared directory)
6. Offer to start the VM
7. Provide guest-side mount instructions

**What gets configured:**
- **Host share path:** `/home/yourusername/GitHub/zoned`
- **virtiofs tag:** `zoned`
- **Guest mount point:** `/mnt/zoned`
- **File permissions:** Readable by all users (fixes UID mismatch)

### In VM (Automated by vm-setup)

The `vm-setup` script will automatically mount virtiofs when you run it. But if you need to do it manually:

```bash
# Create mount point
sudo mkdir -p /mnt/zoned

# Mount virtiofs share
sudo mount -t virtiofs zoned /mnt/zoned

# Make persistent (add to fstab)
echo 'zoned /mnt/zoned virtiofs defaults,nofail 0 0' | sudo tee -a /etc/fstab

# Verify
ls /mnt/zoned/extension/
# Should show: extension.js, metadata.json, etc.
```

---

## Initialize VM Development

**On Host:**

```bash
cd ~/GitHub/zoned
make vm-setup
```

**The setup script will:**

1. **Auto-detect** running VM
2. **Set up SSH** access (creates config, copies keys)
3. **Detect file sharing** method (virtiofs preferred)
4. **Mount virtiofs** share in VM (if not already mounted)
5. **Check dependencies** (install if missing)
6. **Create symlink** to extension directory
7. **Compile GSettings schema** (with virtiofs workaround)
8. **Enable extension**
9. **Reload GNOME Shell** (X11) or show instructions (Wayland)
10. **Save configuration** to `.vm-cache` for fast vm-install iterations

**If multiple VMs are running**, you'll be prompted to select one.

**What happens with permissions:**
- virtiofs passthrough mode preserves host UIDs/GIDs
- Scripts automatically run `chmod -R a+rX` on shared files
- This makes files readable by VM user despite UID mismatch
- No manual intervention required!

---

## Daily Development Workflow

Once setup is complete, your daily development cycle is:

### Terminal Setup

**Terminal 1 - Code Editor:**
```bash
cd ~/GitHub/zoned
code .   # or vim, emacs, etc.
```

**Terminal 2 - Watch VM Logs:**
```bash
cd ~/GitHub/zoned
./scripts/vm logs
# Watches extension logs from VM in real-time
```

### Development Cycle

```
1. Edit code on host
   ↓
2. Save file (changes instantly visible in VM via virtiofs)
   ↓
3. make vm-install (lint → compile → reload)
   ↓
4. View logs on host (Terminal 2 shows output)
   ↓
5. Repeat (2-3 second cycle!)
```

### Quick Commands

```bash
# Fast deploy (lint, compile, reload)
make vm-install

# Watch logs
./scripts/vm logs

# Full setup (if config changes)
make vm-setup

# Start VM headless (saves memory for longhaul testing)
make vm-headless

# View VM status
virsh -c qemu:///session list --all
```

---

## Troubleshooting

### Clean State After VM Snapshot Restore

After restoring a VM snapshot, you need to clean local state:

**1. Remove VM cache file:**
```bash
rm ~/GitHub/zoned/.vm-cache
```

**2. Remove SSH config entry:**
```bash
# Find your VM's SSH entry (e.g., "vm-fedora-42")
grep -A 6 "Host vm-" ~/.ssh/config

# Remove it manually or use sed:
sed -i '/# Added by zoned vm-install/,/^$/d' ~/.ssh/config
```

**3. Re-run setup:**
```bash
make vm-setup
```

**Why this is needed:**
- VM snapshot restore reverts SSH authorized_keys
- IP address might change
- Mount state needs re-verification
- Clean state ensures reliable setup

### virtiofs Mount Fails

**Symptom:** "No such device" or mount errors

**Solutions:**

```bash
# In VM: Check if virtiofs module is loaded
lsmod | grep virtiofs

# If not loaded, try loading it:
sudo modprobe virtiofs

# Check kernel version (needs 5.4+):
uname -r

# Verify virtiofs is configured on host:
virsh -c qemu:///session dumpxml vm-name | grep virtiofs
```

### Permission Denied on Shared Files

**Symptom:** Extension fails to load with permission errors

**Solution:**

The scripts should handle this automatically, but if you see permission errors:

```bash
# On host, fix permissions:
chmod -R a+rX ~/GitHub/zoned

# This makes files readable by all users
# Required because virtiofs preserves host UIDs/GIDs
```

### Extension Not Loading

**Check extension status in VM:**
```bash
gnome-extensions info zoned@hamiltonia.me
```

**Verify symlink:**
```bash
ls -la ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me
# Should point to: /mnt/zoned/extension
```

**Check for errors:**
```bash
journalctl /usr/bin/gnome-shell -f | grep -i zoned
```

**Reload GNOME Shell:**
- `Alt+F2` → `r` → Enter

### SSH Connection Fails

**Verify SSH is running in VM:**
```bash
sudo systemctl status sshd
```

**Check VM IP:**
```bash
# In VM:
ip addr show | grep "inet " | grep -v 127.0.0.1
```

**Test connection from host:**
```bash
ssh -v your-vm-ip
```

### Alt+F2 Not Working

**Verify X11 session:**
```bash
echo $XDG_SESSION_TYPE
# Must be 'x11', not 'wayland'
```

**If Wayland:**
- Log out
- Click gear icon at login
- Select **"GNOME on Xorg"**
- Log back in

---

## Advanced: File Sharing Comparison

| Feature | virtiofs (Recommended) | SPICE WebDAV |
|---------|------------------------|--------------|
| **Speed** | Near-native (kernel-level) | Slower (userspace) |
| **Setup** | `make vm-virtiofs-migrate` | GNOME Boxes UI |
| **Headless** | ✓ Works | ✗ Needs display client |
| **Memory** | Lower overhead | Higher (gvfs daemon) |
| **Permissions** | Auto-handled by scripts | Works out of box |
| **Best for** | Development, testing | Quick prototyping |

**We recommend virtiofs** for all development workflows. The automated permission handling makes it just as easy as SPICE, but much faster.

---

## Advanced: Headless VM Mode

For extended testing (memory leak detection, stability testing), run VM without display client to save ~500MB memory.

**Start VM headless:**
```bash
make vm-headless
```

**Check status:**
```bash
make vm-status
```

**Attach display when needed:**
```bash
make vm-display
```

**Stop VM:**
```bash
make vm-stop
```

**Requirements:**
- `virt-viewer` package installed on host
- VM managed by libvirt (GNOME Boxes VMs work)

---

## Summary

**Setup (one-time):**
1. Install GNOME Boxes + virtiofsd on host
2. Create VM in GNOME Boxes
3. Install OS (Fedora 42 recommended)
4. `make vm-virtiofs-migrate` (automated virtiofs setup)
5. `make vm-setup` (SSH + verify + install extension)

**Daily workflow:**
1. Start VM in GNOME Boxes
2. Edit code on host: `code ~/GitHub/zoned`
3. `make vm-install` (deploys in 2-3 seconds)
4. `./scripts/vm logs` (watch extension output)
5. Repeat!

**Key commands:**
- `make vm-setup` - Full VM configuration
- `make vm-install` - Fast deploy (daily use)
- `./scripts/vm logs` - Watch extension logs
- `make vm-virtiofs-migrate` - Convert to virtiofs

**Next Steps:**
- See [DEVELOPMENT.md](../DEVELOPMENT.md) for general development workflow
- Run `make vm-stability-test` for comprehensive testing

---

**Questions or Issues?**

Check the troubleshooting section above or review the scripts in `scripts/` directory.
