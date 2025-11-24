# VM Development Setup Guide

Complete step-by-step guide to set up VM-based development for Zoned GNOME Shell Extension.

**Why VM Development?** Fedora 43+ removed X11 support, meaning GNOME Shell reload requires logout/login (~15-30 seconds). Using a Fedora VM with X11 allows quick reload with `Alt+F2 → r` (~2-3 seconds).

**Time Required:** 30-45 minutes for initial setup

---

## Table of Contents

1. [Host Prerequisites](#part-1-host-prerequisites-5-minutes)
2. [Download Fedora ISO](#part-2-download-fedora-iso-5-10-minutes)
3. [Create VM in GNOME Boxes](#part-3-create-vm-in-gnome-boxes-10-15-minutes)
4. [Configure VM Guest Tools](#part-4-configure-vm-guest-tools-5-minutes)
5. [Configure Shared Folder](#part-5-configure-shared-folder-5-minutes)
6. [Set Up SSH Access](#part-6-set-up-ssh-access-5-minutes)
7. [Initialize Zoned VM Development](#part-7-initialize-zoned-vm-development-5-minutes)
8. [Daily Development Workflow](#daily-development-workflow)
9. [Troubleshooting](#troubleshooting)

---

## Part 1: Host Prerequisites (5 minutes)

**On your Fedora host (Wayland) machine:**

- [ ] Install GNOME Boxes and virtualization tools:
  ```bash
  sudo dnf install gnome-boxes virt-manager libvirt
  ```

- [ ] Start and enable libvirt service:
  ```bash
  sudo systemctl enable --now libvirtd
  ```

- [ ] Verify KVM support (should show `kvm_intel` or `kvm_amd`):
  ```bash
  lsmod | grep kvm
  ```

- [ ] Add your user to libvirt group (optional, for better permissions):
  ```bash
  sudo usermod -a -G libvirt $USER
  # Log out and log back in for group changes to take effect
  ```

---

## Part 2: Download Fedora ISO (5-10 minutes)

**Download Fedora 42 Workstation** (last version with X11 support):

- [ ] Visit [Fedora Download Page](https://getfedora.org/en/workstation/download/)
  - Or use direct link: https://download.fedoraproject.org/pub/fedora/linux/releases/42/Workstation/x86_64/iso/

- [ ] Download the ISO (approximately 2.2 GB):
  ```bash
  cd ~/Downloads
  # Use wget or download via browser
  wget https://download.fedoraproject.org/pub/fedora/linux/releases/42/Workstation/x86_64/iso/Fedora-Workstation-Live-x86_64-42-1.6.iso
  ```

- [ ] (Optional) Verify checksum for integrity

**Alternative:** You can also download Fedora 43 if you want to test Wayland-specific behavior, but Fedora 42 with X11 is recommended for faster development cycles.

---

## Part 3: Create VM in GNOME Boxes (10-15 minutes)

### Launch GNOME Boxes

- [ ] Open GNOME Boxes:
  ```bash
  gnome-boxes
  ```

### Create New VM

- [ ] Click the **"New"** (+ button) in the top-left corner

- [ ] Select **"Operating System Image File"**

- [ ] Click **"Select a file"** and navigate to your downloaded Fedora ISO

- [ ] GNOME Boxes will auto-detect Fedora. Review the configuration:
  - **Operating System:** Fedora 42
  - **Firmware:** UEFI (recommended)

### Customize Resources

- [ ] Click **"Customize"** before creating

- [ ] Set resources:
  - **Memory:** 4096 MB (4 GB) minimum, 6144 MB (6 GB) recommended
  - **Maximum Disk Size:** 20 GB minimum, 30 GB comfortable
  - **CPUs:** 2 cores (adjust based on your system)

- [ ] Click **"Create"**

### Install Fedora

- [ ] Wait for VM to boot from ISO (~30 seconds)

- [ ] Click **"Install to Hard Drive"** in the live environment

- [ ] Follow Fedora installation wizard:
  - **Keyboard:** Select your keyboard layout
  - **Time & Date:** Select your timezone
  - **Installation Destination:** Select the virtual disk (should be auto-selected)
  - **User Creation:**
    - Username: (your choice, e.g., same as host username)
    - Password: (your choice)
    - ✓ Make this user administrator

- [ ] Click **"Begin Installation"**

- [ ] Wait for installation to complete (~5-10 minutes)

- [ ] Click **"Finish Installation"**

- [ ] Click **"Restart Now"**

### First Boot

- [ ] VM will reboot into the installed system

- [ ] Complete the GNOME initial setup wizard:
  - **Privacy:** Configure location services (your choice)
  - **Online Accounts:** Skip or configure (your choice)
  - **Ready to Go:** Click "Start Using Fedora"

### Install X11 Support

- [ ] Open terminal in VM

- [ ] Install X11 session package:
  ```bash
  sudo dnf install -y gnome-session-xsession
  ```

- [ ] Reboot VM:
  ```bash
  sudo reboot
  ```

### Verify X11 Session

- [ ] After reboot, log in and verify you're using X11:
  ```bash
  # In VM terminal:
  echo $XDG_SESSION_TYPE
  # Should output: x11
  ```

  - If it shows `wayland`, you need to switch to X11:
    - Log out
    - At login screen, click the **gear icon** at bottom right
    - Select **"GNOME on Xorg"** (this option appears after installing gnome-session-xsession)
    - Log back in

- [ ] Verify Alt+F2 works:
  - Press `Alt+F2` in the VM
  - Type: `echo "test"`
  - Press Enter
  - You should see the run dialog (this is how you'll reload GNOME Shell)

---

## Part 4: Configure VM Guest Tools (5 minutes)

**In the VM**, install SPICE guest tools for shared folder support:

- [ ] Open terminal in VM

- [ ] Update system:
  ```bash
  sudo dnf update -y
  ```

- [ ] Install SPICE tools:
  ```bash
  sudo dnf install -y spice-vdagent spice-webdavd
  ```

- [ ] Enable SPICE services:
  ```bash
  sudo systemctl enable --now spice-vdagentd
  systemctl --user enable --now spice-webdavd
  ```

- [ ] Reboot VM for changes to take effect:
  ```bash
  sudo reboot
  ```

- [ ] After reboot, verify services are running:
  ```bash
  systemctl --user status spice-webdavd
  # Should show "active (running)"
  
  ps aux | grep spice-vdagent
  # Should show the daemon running
  ```

---

## Part 5: Configure Shared Folder (5 minutes)

### On Host

- [ ] In GNOME Boxes, right-click your VM → **"Properties"**

- [ ] Click **"Devices & Shares"** tab

- [ ] Under **"Shared Folders"**, click the **[+]** button

- [ ] Configure shared folder:
  - **Local Folder:** Click browse and select: `/home/yourusername/GitHub/zoned`
  - **Name:** `zoned` (this is the share name the VM will see)

- [ ] Click **"Add"** or **"Save"**

### In VM

- [ ] Open **Files** (file manager) in the VM

- [ ] Navigate to: **Other Locations** → **Networks**

- [ ] You should see **"Spice client folder"** listed
  - If not visible, wait 30 seconds and refresh (F5)
  - Or restart spice-webdavd: `systemctl --user restart spice-webdavd`

- [ ] Click **"Spice client folder"** to mount it

- [ ] Verify the shared folder contains your Zoned extension:
  ```bash
  # In VM terminal:
  # The shared folder mounts under gvfs with a URL-encoded path
  ls -la /run/user/1000/gvfs/dav+sd\:host\=Spice%2520client%2520folder._webdav._tcp.local/zoned/extension/
  # Should show: extension.js, metadata.json, etc.
  
  # Tip: You can also access it via the Files app navigation to avoid typing the long path
  ```

---

## Part 6: Set Up SSH Access (5 minutes)

SSH allows you to view logs and control the VM from your host terminal.

### In VM

- [ ] Install OpenSSH server:
  ```bash
  sudo dnf install -y openssh-server
  ```

- [ ] Enable and start SSH service:
  ```bash
  sudo systemctl enable --now sshd
  ```

- [ ] Get VM's IP address:
  ```bash
  ip addr show | grep "inet " | grep -v 127.0.0.1
  ```
  
  - Note the IP address (usually `192.168.122.XXX`)
  - Example: `192.168.122.100`

### On Host

- [ ] Test SSH connection (replace with your VM username and IP):
  ```bash
  ssh yourusername@192.168.122.100
  # Type 'yes' to accept fingerprint
  # Enter VM password
  # If successful, you'll see VM prompt
  exit
  ```

- [ ] Generate SSH key on host (if you don't have one):
  ```bash
  # Check if you already have an SSH key:
  ls -la ~/.ssh/id_*.pub
  
  # If no key exists, generate one (press Enter to accept defaults):
  ssh-keygen -t ed25519 -C "your_email@example.com"
  # Or use RSA if ed25519 isn't supported:
  # ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
  ```

- [ ] Copy SSH key to VM for passwordless authentication:
  ```bash
  ssh-copy-id yourusername@192.168.122.100
  # Enter VM password one last time
  ```

- [ ] Test passwordless connection:
  ```bash
  ssh yourusername@192.168.122.100 "echo 'SSH works!'"
  # Should print "SSH works!" without asking for password
  ```

- [ ] (Optional) Add SSH config for convenience:
  ```bash
  # Edit ~/.ssh/config
  cat >> ~/.ssh/config << 'EOF'
  
  Host fedora-vm
      HostName 192.168.122.100
      User yourusername
  EOF
  ```

- [ ] Test using alias:
  ```bash
  ssh fedora-vm "echo 'Alias works!'"
  ```

---

## Part 7: Initialize Zoned VM Development (5 minutes)

**On Host**, run the Zoned VM initialization scripts:

- [ ] Navigate to Zoned project:
  ```bash
  cd ~/GitHub/zoned
  ```

- [ ] Initialize VM configuration:
  ```bash
  make vm-init
  ```
  
  - Enter VM SSH host alias: `fedora-vm`
  - Enter VM username: (your VM username)
  - Enter VM IP: `192.168.122.XXX` (from Part 6)

- [ ] Configure VM environment (creates symlinks, enables extension):
  ```bash
  make vm-setup
  ```
  
  - This will:
    - ✓ Test SSH connection
    - ✓ Verify shared folder is mounted
    - ✓ Create symlink to extension
    - ✓ Enable extension
    - ✓ Compile GSettings schema

- [ ] In VM, reload GNOME Shell to load the extension:
  - Press `Alt+F2`
  - Type: `r`
  - Press `Enter`
  - Wait 2-3 seconds for reload

- [ ] Verify extension is running in VM:
  ```bash
  # On host, check extension status via SSH:
  ssh fedora-vm "gnome-extensions info zoned@hamiltonia.me"
  # Should show: State: ENABLED
  ```

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
make vm-logs
# Watches extension logs from VM in real-time
```

**Terminal 3 - Git and Commands:**
```bash
cd ~/GitHub/zoned
# git commands, make commands, etc.
```

### Development Cycle

```
1. Edit code on host
   ↓
2. Save file (changes instantly visible in VM via shared folder)
   ↓
3. In VM: Alt+F2 → r → Enter (2-3 second reload)
   ↓
4. View logs on host (Terminal 2 shows output)
   ↓
5. Repeat
```

### Quick Commands

```bash
# After editing code, push to VM and reload:
make vm-install

# Watch logs:
make vm-logs

# Watch all GNOME Shell logs (not just Zoned):
./scripts/vm-logs all
```

---

## Troubleshooting

### Shared Folder Not Appearing

**Symptom:** "Spice client folder" not visible in VM file manager

**Solutions:**

- [ ] Restart spice-webdavd in VM:
  ```bash
  systemctl --user restart spice-webdavd
  systemctl --user status spice-webdavd
  ```

- [ ] Check for errors:
  ```bash
  journalctl --user -u spice-webdavd -n 50
  ```

- [ ] Reboot VM:
  ```bash
  sudo reboot
  ```

- [ ] Verify shared folder is configured in GNOME Boxes (Host):
  - Right-click VM → Properties → Devices & Shares
  - Should show the shared folder

### Extension Not Loading

**Symptom:** Extension doesn't appear after enabling

**Solutions:**

- [ ] Check extension status in VM:
  ```bash
  gnome-extensions info zoned@hamiltonia.me
  ```

- [ ] Verify symlink in VM:
  ```bash
  ls -la ~/.local/share/gnome-shell/extensions/
  # Should show: zoned@hamiltonia.me -> /run/user/1000/gvfs/dav+sd:host=Spice%20client%20folder._webdav._tcp.local/zoned/extension
  ```

- [ ] Check for errors in VM:
  ```bash
  journalctl /usr/bin/gnome-shell | grep -i zoned
  ```

- [ ] Reload GNOME Shell in VM:
  ```bash
  # Alt+F2 → r → Enter
  ```

### SSH Connection Fails

**Symptom:** Cannot SSH to VM from host

**Solutions:**

- [ ] Verify SSH is running in VM:
  ```bash
  sudo systemctl status sshd
  ```

- [ ] Check VM IP hasn't changed:
  ```bash
  # In VM:
  ip addr show
  ```

- [ ] Test with verbose output:
  ```bash
  # On host:
  ssh -v yourusername@192.168.122.XXX
  ```

- [ ] Check firewall in VM (if enabled):
  ```bash
  sudo firewall-cmd --list-all
  sudo firewall-cmd --add-service=ssh --permanent
  sudo firewall-cmd --reload
  ```

### Alt+F2 Not Working in VM

**Symptom:** Alt+F2 doesn't open run dialog

**Solutions:**

- [ ] Verify X11 session:
  ```bash
  echo $XDG_SESSION_TYPE
  # Must be 'x11', not 'wayland'
  ```

- [ ] If Wayland, log out and select "GNOME on Xorg" at login

- [ ] Check keybinding:
  ```bash
  gsettings get org.gnome.desktop.wm.keybindings panel-run-dialog
  # Should show: ['<Alt>F2']
  ```

---

## Advanced Tips

### VM Snapshots

Before testing risky changes:

1. GNOME Boxes → Right-click VM → Properties → Snapshots
2. Click **"+"** to create snapshot
3. Name it: "Before feature X"
4. If something breaks, revert to snapshot

### Multiple VMs

You can run both:
- **Fedora 42 (X11)** - for fast daily development
- **Fedora 43 (Wayland)** - for final testing before commits

Share the same extension folder to both VMs.

### Auto-Start Log Watcher in VM

For convenience, automatically pipe logs to shared folder:

**In VM:**
```bash
# Copy the watcher script (it's in shared folder):
# First, find the gvfs mount point (easier via Files app: Other Locations → Networks → Spice client folder)
# Or use the full gvfs path:
cp /run/user/1000/gvfs/dav+sd\:host\=Spice%2520client%2520folder._webdav._tcp.local/zoned/scripts/vm-guest/auto-log-watcher.sh ~/

# Make executable:
chmod +x ~/auto-log-watcher.sh

# Run in background:
nohup ~/auto-log-watcher.sh > /dev/null 2>&1 &

# Now logs appear in: ~/GitHub/zoned/zoned-extension.log on host
tail -f ~/GitHub/zoned/zoned-extension.log
```

---

## Summary

**Setup (one-time):**
1. Install GNOME Boxes on host
2. Download Fedora 42 ISO
3. Create and install VM
4. Install SPICE tools in VM
5. Configure shared folder
6. Set up SSH
7. Run `make vm-init` and `make vm-setup`

**Daily workflow:**
1. Edit code on host: `code ~/GitHub/zoned`
2. Watch logs from host: `make vm-logs`
3. Reload in VM: `Alt+F2 → r`
4. Repeat (2-3 second cycle!)

**Commands:**
- `make vm-init` - First-time configuration
- `make vm-setup` - Configure VM environment
- `make vm-install` - Update extension in VM
- `make vm-logs` - Watch extension logs
- `make vm-dev` - Quick install + reload

**Next Steps:**
- See [DEVELOPMENT.md](../DEVELOPMENT.md) for general development workflow
- See [memory/development/vm-workflow.md](../memory/development/vm-workflow.md) for detailed VM workflow reference

---

**Questions or Issues?**

If you encounter problems not covered here, check the detailed troubleshooting guide in `memory/development/vm-workflow.md`.
