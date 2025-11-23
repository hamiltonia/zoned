# Zoned Development: VM-Based Workflow

**Problem**: Fedora 43+ removed GNOME X11 support. Developing extensions on Wayland requires logout/login after every code change (~15+ seconds).

**Solution**: Develop on host, test in VM with X11 using automated scripts (2-3 second reload cycle).

---

## Quick Start

If you just want to get started developing Zoned in a VM:

```bash
# 1. Create a Fedora VM with X11 (see VM Setup below)
# 2. Configure VM connection
make vm-init

# 3. Set up the VM (one-time setup)
make vm-setup

# 4. After making code changes
make vm-install

# 5. Watch logs
make vm-logs
```

The rest of this guide explains the details and troubleshooting.

---

## Table of Contents

1. [Why This Workflow](#why-this-workflow)
2. [Architecture Overview](#architecture-overview)
3. [VM Setup (One-Time)](#vm-setup-one-time)
4. [Zoned Automated Workflow](#zoned-automated-workflow)
5. [Development Iteration Cycle](#development-iteration-cycle)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Tips](#advanced-tips)


---

## Why This Workflow

### The Wayland Problem

- **Fedora 43**: GNOME X11 completely removed, Wayland-only
- **Extension reload**: Requires GNOME Shell restart
- **Wayland limitation**: Shell restart = logout/login (kills all apps)
- **X11 benefit**: Shell restart = `Alt+F2` → `r` (2-3 seconds, keeps apps)

### VM Benefits

✅ **Fast iteration**: 2-3 second reload in VM with X11  
✅ **Host stability**: Your main session stays up  
✅ **Isolation**: Test extensions without breaking your desktop  
✅ **Snapshots**: Revert when extension breaks GNOME  
✅ **Dual testing**: Run both Fedora 42 (X11) and 43 (Wayland) VMs  

### Workflow Comparison

| Method | Iteration Time | Environment |
|--------|---------------|-------------|
| Wayland host logout/login | 15-30 seconds | Production |
| Nested GNOME Shell | **Broken in GNOME 49** | N/A |
| VM with X11 | **2-3 seconds** | Isolated |
| Distrobox | Fast but doesn't solve reload issue | Shared |


---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ HOST: Your main system                                      │
│                                                             │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ VS Code/Vim  │  │  Terminal   │  │  Terminal        │    │
│  │ Edit code    │  │ make vm-logs│  │  make vm-install │    │
│  └──────────────┘  └─────────────┘  └──────────────────┘    │
│         │                  │                  │             │
│         ├─────────┬────────┴──────────────────┘             │
│         │         │                                         │
│  ┌──────▼─────────▼───────────────────────────────────────┐ │
│  │  ~/GitHub/zoned/                                       │ │
│  │    └── extension/                                      │ │
│  │        ├── extension.js                                │ │
│  │        ├── metadata.json                               │ │
│  │        └── ...                                         │ │
│  └──────────────────┬─────────────────────────────────────┘ │
│                     │ Shared via SPICE (GNOME Boxes)        │
│                     │                                       │
│  ┌──────────────────▼─────────────────────────────────────┐ │
│  │ GNOME Boxes VM: Fedora 42 (X11)                        │ │
│  │                                                        │ │
│  │  Shared folder mounted at:                             │ │
│  │  /run/user/1000/gvfs/dav:*/   (GVFS WebDAV mount)      │ │
│  │       │                                                │ │
│  │       └─ symlinked to ─┐                               │ │
│  │                         ▼                              │ │
│  │  ~/.local/share/gnome-shell/extensions/                │ │
│  │    └── zoned@hamiltonia/  (symlink to .../extension)  │ │
│  │                                                        │ │
│  │  Alt+F2 → 'r' → 2-3 second reload                      │ │
│  │  SSH server running (logs accessible from host)        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Points**:
- Code lives on **host** in `~/GitHub/zoned/extension/`
- Changes are **instantly visible** in VM via SPICE shared folder
- VM runs **X11** (Fedora 42) for fast reload with Alt+F2 → r
- **Logs viewed on host** via SSH using `make vm-logs`
- **Automated scripts** handle setup and deployment
- **Never edit in VM** - just test and reload


---

## VM Setup (One-Time)


### Prerequisites

**On Host**:
```bash
# Install GNOME Boxes if not already installed
sudo dnf install gnome-boxes

# Ensure virtualization is enabled
sudo systemctl enable --now libvirtd
```

### Download Fedora 42 ISO

```bash
# Fedora 42 is the last version with X11 support
cd ~/Downloads
wget https://download.fedoraproject.org/pub/fedora/linux/releases/42/Workstation/x86_64/iso/Fedora-Workstation-Live-x86_64-42-1.6.iso
```

### Create VM in GNOME Boxes

```bash
# Launch GNOME Boxes
gnome-boxes
```

1. Click **"New"** (+ button)
2. Select **"Operating System Image File"**
3. Choose downloaded Fedora 42 ISO
4. Configure:
   - **RAM**: 4-6 GB (adjust based on your system)
   - **Disk**: 20 GB minimum
   - **Firmware**: UEFI (optional, but recommended)
5. Click **"Create"**
6. Follow Fedora installation wizard
   - Create user account (remember credentials)
   - Complete installation
   - Reboot


### Install SPICE Guest Tools in VM

After VM boots into Fedora:

```bash
# In VM terminal
sudo dnf update
sudo dnf install spice-vdagent spice-webdavd openssh-server

# Enable services
sudo systemctl enable --now spice-vdagentd sshd

# Reboot VM for changes to take effect
sudo reboot
```

**What this does**:
- `spice-vdagent`: Clipboard sharing, better mouse integration
- `spice-webdavd`: Shared folder support (WebDAV/GVFS protocol)
- `openssh-server`: SSH access for log viewing from host

### Verify X11 Session

```bash
# In VM, check session type
echo $XDG_SESSION_TYPE
# Should output: x11

# Verify Alt+F2 works
# Press Alt+F2, type: echo "test"
# Should see run dialog appear
```

### Get VM IP Address

```bash
# In VM terminal
ip addr show | grep "inet " | grep -v 127.0.0.1
# Note the IP address (usually 192.168.122.X)
```

### Configure Shared Folder in GNOME Boxes

**On Host**:

1. Right-click VM in GNOME Boxes → **"Properties"**
2. Click **"Devices & Shares"** tab
3. Under **"Shared Folders"**, click **[+]**
4. Configure:
   - **Local Folder**: `~/GitHub/zoned` (or your project directory)
   - **Name**: `zoned`
5. Click **"Save"**

### Mount Shared Folder in VM

**In VM**:

1. Open file manager (Nautilus)
2. Navigate to: **Other Locations → Networks**
3. **Click on "Spice client folder"** to mount it
4. You should see your `zoned` share with the `extension` folder inside

**Important**: The folder is mounted via GVFS at a path like:
```
/run/user/1000/gvfs/dav:host=Spice%20client%20folder._webdav._tcp.local,ssl=false
```

The automated scripts will detect this path automatically.

### Set Up SSH Access

**On Host**:

```bash
# Copy SSH key to VM (replace with your VM's IP)
ssh-copy-id yourusername@192.168.122.X

# Optional: Add to ~/.ssh/config
cat >> ~/.ssh/config << 'EOF'

Host fedora-vm
    HostName 192.168.122.X
    User yourusername
EOF

# Test connection
ssh fedora-vm 'echo "SSH works!"'
```

---

## Zoned Automated Workflow

Now that the VM is set up, use Zoned's automated scripts.

### Step 1: Initialize VM Configuration

**On Host**:

```bash
make vm-init
```

This interactive wizard will:
- Prompt for VM connection details (IP, username)
- Test SSH connectivity
- Save configuration to `~/.config/zoned-dev/config`

### Step 2: Configure VM (One-Time Setup)

```bash
make vm-setup
```

This script will:
- ✅ Detect the GVFS mount path (works with WebDAV shared folders)
- ✅ Create symlink: `~/.local/share/gnome-shell/extensions/zoned@hamiltonia` → shared folder
- ✅ Enable the extension
- ✅ Compile GSettings schema
- ✅ Display next steps

### Step 3: Start Developing

Edit files on your host in `~/GitHub/zoned/extension/`. Changes are instantly visible in the VM.

**After making changes**:

```bash
# Deploy to VM and reload (on X11 attempts auto-reload)
make vm-install

# Watch logs in another terminal
make vm-logs
```

**In the VM window**: Press `Alt+F2`, type `r`, press Enter to reload GNOME Shell.

---

## Development Iteration Cycle

```
┌─────────────────────────────────────────────────────────┐
│ HOST: Edit files in ~/GitHub/zoned/extension/          │
│       (use VS Code, Vim, or any editor)                │
└────────────────────┬────────────────────────────────────┘
                     │ Save file
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Changes instantly visible in VM (GVFS shared folder)   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ HOST: make vm-install (optional: compiles schema)      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ VM: Reload GNOME Shell                                  │
│     Alt+F2 → r → Enter (2-3 seconds)                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ HOST: make vm-logs (watch extension output)            │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
                   Repeat
```

### Available Make Commands

```bash
# First-time setup
make vm-init      # Configure VM connection (interactive)
make vm-setup     # Set up VM for development (run once)

# Daily development
make vm-install   # Deploy changes to VM, compile schema
make vm-logs      # Watch extension logs from host

# Quick development cycle
make vm-dev       # Shortcut: vm-install + reload instructions
```

### Multi-Terminal Setup

**Terminal 1: Code Editor**
```bash
cd ~/GitHub/zoned
code .  # or vim, nvim, etc.
```

**Terminal 2: Watch Logs**
```bash
make vm-logs
# Live stream of GNOME Shell logs from VM
```

**Terminal 3: Deploy Changes**
```bash
# After editing files
make vm-install

# Then in VM: Alt+F2 → r
```

**VM Window**: Keep visible for testing and reloading



---

## Troubleshooting

### `make vm-setup` Can't Find Shared Folder

**Error**: `Shared folder not mounted in VM`

**Solution**:
1. In VM, open Nautilus (file manager)
2. Navigate to: **Other Locations → Networks**
3. **Click on "Spice client folder"** - this mounts it via GVFS
4. Run `make vm-setup` again - it will now detect the mount

If "Spice client folder" doesn't appear:
```bash
# In VM - restart spice service
systemctl --user restart spice-webdavd

# Wait 30 seconds, refresh Nautilus (F5)
# If still not working, reboot VM
```

### Extension Not Loading After Setup

**Error**: Extension doesn't appear in GNOME Extensions

**Check symlink**:
```bash
# In VM
ls -la ~/.local/share/gnome-shell/extensions/zoned@hamiltonia
# Should show symlink to GVFS mount
```

**Check extension files**:
```bash
# In VM - verify files are accessible
cat ~/.local/share/gnome-shell/extensions/zoned@hamiltonia/metadata.json
```

**Enable and reload**:
```bash
# In VM
gnome-extensions enable zoned@hamiltonia
# Then: Alt+F2 → r
```

### `make vm-logs` Shows No Output

**Problem**: SSH connection or journalctl access

**Solutions**:
```bash
# Test SSH connection
ssh yourusername@VM_IP 'echo works'

# Check if you have read access to journal in VM
ssh yourusername@VM_IP 'journalctl -n 10'

# If access denied, add user to systemd-journal group in VM
sudo usermod -a -G systemd-journal $USER
# Log out and back in
```

### Alt+F2 Not Working in VM

**Problem**: Can't reload GNOME Shell

**Check session type**:
```bash
# In VM
echo $XDG_SESSION_TYPE
# Must be 'x11', not 'wayland'
```

**If it shows 'wayland'**:
- Log out of VM
- At login screen, click gear icon
- Select **"GNOME on Xorg"**
- Log back in

### Changes Not Visible in VM

**Problem**: Edit files on host but VM doesn't see changes

**This should never happen** - the shared folder is live. But to verify:

```bash
# On host - create a test file
echo "test" > ~/GitHub/zoned/extension/test.txt

# In VM - check if it appears
cat ~/.local/share/gnome-shell/extensions/zoned@hamiltonia/test.txt
# Should show "test"
```

If file doesn't appear:
- The symlink is broken - run `make vm-setup` again
- The shared folder unmounted - click it again in Nautilus


---

## Advanced Tips

### Using VM Snapshots

Before testing risky code that might break GNOME Shell:

1. **GNOME Boxes** → Right-click VM → **Properties** → **Snapshots**
2. Click **"+"** to create snapshot
3. Name it: "Before testing zone drag feature"
4. Test your code
5. If extension crashes GNOME Shell:
   - Close VM
   - Right-click snapshot → **"Revert to this state"**
   - Reopen VM (~10 seconds)

### Testing on Multiple GNOME Versions

Run both Fedora 42 (X11, faster) and Fedora 43 (Wayland, production) VMs:

**Workflow**:
- **Daily dev**: Use F42 VM (fast Alt+F2 reload)
- **Pre-commit**: Test on F43 VM (Wayland environment)
- **Share folder**: Point both VMs to `~/GitHub/zoned`

Configure each VM separately with `make vm-init`.

### Using Looking Glass Debugger

For interactive debugging in the VM:

```bash
# In VM: Press Alt+F2
# Type: lg
# Press Enter
```

**Looking Glass features**:
- **Extensions tab**: See all extensions and their state
- **Console**: Execute JavaScript in GNOME Shell context
- **Windows**: Inspect window objects
- **Actors**: Debug Clutter actors (useful for UI work)

### Keyboard Shortcuts Reference

**In VM**:
- `Alt+F2` → `r` → Enter: Reload GNOME Shell (X11 only)
- `Alt+F2` → `lg` → Enter: Open Looking Glass debugger
- `Alt+F2` → `rt` → Enter: Reload theme (for CSS changes)

**On Host**:
- Normal editor shortcuts still work
- `Ctrl+Shift+T`: New terminal tab (for vm-logs)


---

## Quick Reference

### Daily Development Commands

```bash
# On host - after editing files
make vm-install        # Deploy to VM and compile schema

# On host - watch logs
make vm-logs          # Live stream of GNOME Shell logs

# In VM - reload GNOME Shell
Alt+F2 → r → Enter    # 2-3 seconds (X11 only)
```

### VM Management Commands

```bash
# First-time setup
make vm-init          # Configure connection (interactive)
make vm-setup         # Set up symlinks and enable extension

# Shortcuts
make vm-dev           # Install + show reload instructions
```

### Directory Structure

```
Host: ~/GitHub/zoned/
├── extension/              ← Edit here
│   ├── extension.js
│   ├── metadata.json
│   ├── keybindingManager.js
│   └── ...
├── scripts/                ← Automation scripts
│   ├── vm-init
│   ├── vm-setup
│   ├── vm-install
│   └── vm-logs
└── Makefile                ← make vm-* commands

VM: ~/.local/share/gnome-shell/extensions/
└── zoned@hamiltonia/       ← Symlink to shared folder
    └── (points to GVFS mount of ~/GitHub/zoned/extension/)
```

### Time Savings

| Method | Reload Time | Notes |
|--------|-------------|-------|
| Wayland host | 15-30 sec | Logout/login required |
| X11 VM (this workflow) | **2-3 sec** | Alt+F2 → r |
| **Speed improvement** | **10x faster** | ✅ |

---

**Last Updated**: November 2024  
**For**: Zoned GNOME Shell Extension  
**Tested**: Fedora 43 (host) + Fedora 42 VM (X11), GNOME 49
