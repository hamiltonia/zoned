# VM Development Setup Guide

Complete step-by-step guide to set up VM-based development for Zoned GNOME Shell Extension.

**Why VM Development?** Fedora 43+ removed X11 support, meaning GNOME Shell reload requires logout/login (~15-30 seconds). Using a VM with X11 allows quick reload with `Alt+F2 → r` (~2-3 seconds).

**Supported Host OSes:** Fedora, Ubuntu, Arch Linux
**Supported Guest OSes:** Fedora 42+, Ubuntu 22.04/24.04 LTS, Arch Linux

**Time Required:** 30-45 minutes for initial setup

---

## Table of Contents

1. [Host Prerequisites](#part-1-host-prerequisites-5-minutes)
2. [Network Setup (Important!)](#part-2-network-setup-2-minutes)
3. [Download OS ISO](#part-3-download-os-iso-5-10-minutes)
4. [Create VM in GNOME Boxes](#part-4-create-vm-in-gnome-boxes-10-15-minutes)
5. [Configure VM Guest Tools](#part-5-configure-vm-guest-tools-5-minutes)
6. [Configure Shared Folder](#part-6-configure-shared-folder-5-minutes)
7. [Set Up SSH Access](#part-7-set-up-ssh-access-5-minutes)
8. [Initialize Zoned VM Development](#part-8-initialize-zoned-vm-development-5-minutes)
9. [Daily Development Workflow](#daily-development-workflow)
10. [Troubleshooting](#troubleshooting)

---

## Part 1: Host Prerequisites (5 minutes)

**On your host machine:**

<details>
<summary><b>Fedora Host</b></summary>

- [ ] Install GNOME Boxes and virtualization tools:
  ```bash
  sudo dnf install gnome-boxes virt-manager libvirt
  ```

- [ ] Start and enable libvirt service:
  ```bash
  sudo systemctl enable --now libvirtd
  ```
</details>

<details>
<summary><b>Ubuntu Host</b></summary>

- [ ] Install GNOME Boxes and virtualization tools:
  ```bash
  sudo apt-get update
  sudo apt-get install gnome-boxes virt-manager libvirt-daemon-system libvirt-clients qemu-kvm
  ```

- [ ] Start and enable libvirt service:
  ```bash
  sudo systemctl enable --now libvirtd
  ```
</details>

<details>
<summary><b>Arch Linux Host</b></summary>

- [ ] Install GNOME Boxes and virtualization tools:
  ```bash
  sudo pacman -S gnome-boxes virt-manager libvirt qemu-full dnsmasq
  ```

- [ ] Start and enable libvirt service:
  ```bash
  sudo systemctl enable --now libvirtd
  ```
</details>

**All Hosts:**

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

## Part 2: Network Setup (2 minutes)

**⚠️ IMPORTANT:** If you have Docker installed, VM networking won't work out of the box. Docker sets iptables FORWARD policy to DROP, blocking VM traffic. Even without Docker, running this ensures proper NAT configuration.

**Run this BEFORE creating your VM:**

```bash
# Navigate to zoned directory
cd ~/GitHub/zoned

# Run automated network setup
make vm-network-setup
```

This script will:
- ✓ Enable IP forwarding
- ✓ Add iptables FORWARD rules for VM bridge (virbr0)
- ✓ Configure NAT MASQUERADE for VM subnet
- ✓ Make changes persistent (survives reboot)
- ✓ Auto-detect your host distro and use appropriate persistence method

**The script is safe to run multiple times** (idempotent). It detects existing rules and skips them.

<details>
<summary><b>Manual Alternative (if script fails)</b></summary>

Get your physical network interface:
```bash
ip route show default | grep -oP 'dev \K\S+'
# Example output: wlp59s0
```

Add rules (replace `wlp59s0` with your interface):
```bash
# Enable IP forwarding
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-libvirt.conf

# Add FORWARD rules (at TOP of chain, before Docker's DROP)
sudo iptables -I FORWARD 1 -i virbr0 -j ACCEPT
sudo iptables -I FORWARD 1 -o virbr0 -j ACCEPT

# Add NAT MASQUERADE
sudo iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -o wlp59s0 -j MASQUERADE

# Make persistent (Fedora)
sudo firewall-cmd --permanent --direct --add-rule ipv4 nat POSTROUTING 0 -s 192.168.122.0/24 ! -d 192.168.122.0/24 -o wlp59s0 -j MASQUERADE
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -i virbr0 -j ACCEPT
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -o virbr0 -j ACCEPT
sudo firewall-cmd --reload
```

For detailed troubleshooting, see [vm-network-troubleshooting.md](../memory/development/vm-network-troubleshooting.md).
</details>

---

## Part 3: Download OS ISO (5-10 minutes)

Choose a guest OS based on your needs:

| Guest OS | GNOME Version | X11 Support | Notes |
|----------|---------------|-------------|-------|
| **Fedora 42** | 47 | ✓ Yes (install pkg) | Recommended for extension development |
| **Ubuntu 24.04** | 46 | ✓ Yes (built-in) | LTS, good alternative |
| **Ubuntu 22.04** | 42 | ✓ Yes (built-in) | Older GNOME, may have compatibility issues |
| **Arch Linux** | Latest | ✓ Yes (install pkg) | Rolling release, always latest GNOME |

<details>
<summary><b>Fedora 42 (Recommended)</b></summary>

- [ ] Visit [Fedora Download Page](https://getfedora.org/en/workstation/download/)
  - Or use direct link: https://download.fedoraproject.org/pub/fedora/linux/releases/42/Workstation/x86_64/iso/

- [ ] Download the ISO (approximately 2.2 GB):
  ```bash
  cd ~/Downloads
  wget https://download.fedoraproject.org/pub/fedora/linux/releases/42/Workstation/x86_64/iso/Fedora-Workstation-Live-x86_64-42-1.6.iso
  ```

**Note:** Fedora 42 is the last version with X11 session available by default. Fedora 43+ removed X11.
</details>

<details>
<summary><b>Ubuntu 24.04 LTS</b></summary>

- [ ] Visit [Ubuntu Download Page](https://ubuntu.com/download/desktop)

- [ ] Download the ISO (approximately 5.8 GB):
  ```bash
  cd ~/Downloads
  wget https://releases.ubuntu.com/24.04/ubuntu-24.04.1-desktop-amd64.iso
  ```

**Note:** Ubuntu includes "GNOME on Xorg" option at login by default.
</details>

<details>
<summary><b>Arch Linux</b></summary>

- [ ] Visit [Arch Linux Download Page](https://archlinux.org/download/)

- [ ] Download the ISO and follow [official installation guide](https://wiki.archlinux.org/title/Installation_guide)

**Note:** Arch requires manual installation. Install `gnome` and `gnome-session` for X11 support.
</details>

---

## Part 4: Create VM in GNOME Boxes (10-15 minutes)

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

## Part 5: Configure VM Guest Tools (5 minutes)

**In the VM**, install SPICE guest tools for shared folder support:

- [ ] Open terminal in VM

<details>
<summary><b>Fedora Guest</b></summary>

```bash
# Update system
sudo dnf update -y

# Install SPICE tools
sudo dnf install -y spice-vdagent spice-webdavd
```
</details>

<details>
<summary><b>Ubuntu Guest</b></summary>

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install SPICE tools
sudo apt-get install -y spice-vdagent spice-webdavd
```
</details>

<details>
<summary><b>Arch Linux Guest</b></summary>

```bash
# Update system
sudo pacman -Syu

# Install SPICE tools
sudo pacman -S spice-vdagent
# Note: spice-webdavd may be in AUR as 'phodav'
```
</details>

- [ ] Enable SPICE services (all distros):
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

## Part 6: Configure Shared Folder (5 minutes)

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

## Part 7: Set Up SSH Access (5 minutes)

SSH allows you to view logs and control the VM from your host terminal.

### In VM

<details>
<summary><b>Fedora Guest</b></summary>

```bash
# Install OpenSSH server
sudo dnf install -y openssh-server

# Enable and start SSH service
sudo systemctl enable --now sshd
```
</details>

<details>
<summary><b>Ubuntu Guest</b></summary>

```bash
# Install OpenSSH server
sudo apt-get install -y openssh-server

# Enable and start SSH service
sudo systemctl enable --now ssh
```

Note: Ubuntu uses `ssh` service name instead of `sshd`.
</details>

<details>
<summary><b>Arch Linux Guest</b></summary>

```bash
# Install OpenSSH server
sudo pacman -S openssh

# Enable and start SSH service
sudo systemctl enable --now sshd
```
</details>

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

## Part 8: Initialize Zoned VM Development (5 minutes)

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
2. **Run `make vm-network-setup`** (configures host networking)
3. Download OS ISO (Fedora 42, Ubuntu 24.04, or Arch)
4. Create and install VM
5. Install SPICE tools in VM
6. Configure shared folder
7. Set up SSH
8. Run `make vm-init` and `make vm-setup`

**Daily workflow:**
1. Edit code on host: `code ~/GitHub/zoned`
2. Watch logs from host: `make vm-logs`
3. Reload in VM: `Alt+F2 → r`
4. Repeat (2-3 second cycle!)

**Commands:**
- `make vm-network-setup` - Configure host networking (run once)
- `make vm-init` - First-time VM configuration
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
