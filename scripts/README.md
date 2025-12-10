# Zoned Development Scripts

Helper scripts for VM-based development workflow.

## VM Development Scripts

These scripts enable fast development cycles using a VM (Fedora, Ubuntu, or Arch) with X11 for 2-3 second reload times (vs 15-30 seconds on Wayland).

**Supported Host OSes:** Fedora, Ubuntu, Arch Linux
**Supported Guest OSes:** Fedora 42+, Ubuntu 22.04/24.04, Arch Linux

### Host-Side Scripts (Run on your development machine)

#### `vm-network-setup`
**Purpose:** Configure host networking for GNOME Boxes VMs  
**When to use:** Once before creating VMs, or when VM can't access internet  
**What it does:**
- Detects host OS (Fedora/Ubuntu/Arch)
- Enables IP forwarding
- Adds iptables FORWARD rules for virbr0 bridge
- Configures NAT MASQUERADE for VM subnet
- Makes rules persistent (survives reboot)

**Why needed:** Docker sets iptables FORWARD policy to DROP, blocking VM traffic.

**Usage:**
```bash
make vm-network-setup
# or
./scripts/vm-network-setup
```

#### `init-vm-config`
**Purpose:** Interactive first-time setup wizard  
**When to use:** Once per system when setting up VM development  
**What it does:**
- Asks if you have an SSH alias configured already
- If no SSH alias: Walks you through complete SSH setup
  - Asks for VM IP address, alias name, and username
  - Creates `~/.ssh/config` entry automatically
  - Offers to copy SSH keys with `ssh-copy-id`
- If already have SSH alias: Tests connection and extracts details
- **SPICE setup (GNOME Boxes):** Checks if VM has required shared folder packages
  - Detects guest OS (Ubuntu/Fedora/Arch/etc.)
  - Installs `spice-vdagent` and `spice-webdavd` if missing
  - Enables and starts the spice-webdavd service
- Creates `~/.config/zoned-dev/config` file
- Used by other scripts

**Usage:**
```bash
make vm-init
# or
./scripts/init-vm-config
```

#### `vm-setup`
**Purpose:** One-time VM environment configuration  
**When to use:** After running `init-vm-config` and setting up shared folder  
**What it does:**
- Detects guest OS (Fedora/Ubuntu/Arch)
- Verifies VM is accessible via SSH
- Checks shared folder is mounted
- Creates symlink from extension to GNOME extensions directory
- Enables extension in VM
- Compiles GSettings schema

**Usage:**
```bash
make vm-setup
# or
./scripts/vm-setup
```

#### `vm-install`
**Purpose:** Install/update extension in VM during development  
**When to use:** After editing code, to push changes to VM  
**What it does:**
- Verifies VM connection
- Compiles GSettings schema if present
- Checks/enables extension
- Attempts to reload GNOME Shell (on X11)

**Usage:**
```bash
make vm-install
# or
./scripts/vm-install
```

#### `vm-logs`
**Purpose:** Watch extension logs from VM in real-time  
**When to use:** During development to see console output  
**What it does:**
- SSHs to VM
- Tails GNOME Shell logs
- Filters for "zoned" messages (or shows all with `all` argument)

**Usage:**
```bash
make vm-logs           # Filtered logs
./scripts/vm-logs all  # All GNOME Shell logs
```

### VM Guest Scripts (Copy to and run inside VM)

#### `vm-guest/auto-log-watcher.sh`
**Purpose:** Automatically pipe logs to shared folder  
**When to use:** Optional - if you prefer file-based log viewing  
**What it does:**
- Watches GNOME Shell logs
- Filters for "zoned" messages
- Writes to shared folder (visible on host)

**Installation (in VM):**
```bash
# Copy from shared folder
cp /run/user/1000/spice-client-folder/scripts/vm-guest/auto-log-watcher.sh ~/

# Make executable
chmod +x ~/auto-log-watcher.sh

# Run in background
nohup ~/auto-log-watcher.sh > /dev/null 2>&1 &

# View logs on host
tail -f ~/GitHub/zoned/zoned-extension.log
```

## Configuration File

All scripts read from: `~/.config/zoned-dev/config`

**Example:**
```bash
# VM connection details
VM_HOST="fedora-vm"
VM_USER="yourusername"
VM_IP="192.168.122.100"

# Project paths
HOST_PROJECT_DIR="/home/yourusername/GitHub/zoned"
VM_SPICE_MOUNT="/run/user/1000/spice-client-folder"

# Extension details
EXTENSION_UUID="zoned@hamiltonia.me"
```

This file is created by `init-vm-config` and can be edited manually if needed.

### Library Scripts

#### `lib/distro-detect.sh`
**Purpose:** Shared library for distro detection  
**When to use:** Sourced by other scripts, not run directly  
**What it provides:**
- `detect_host_distro` - Detect local OS
- `detect_guest_distro` - Detect remote VM OS via SSH
- `get_package_manager` - Get package manager for distro
- `get_firewall_tool` - Get firewall tool for distro
- `get_install_command` - Get full install command string

## Typical Workflow

### Initial Setup (Once)
```bash
# 1. Configure host networking (IMPORTANT - do this first!)
make vm-network-setup

# 2. Create Fedora/Ubuntu/Arch VM in GNOME Boxes (see docs/VM-SETUP-GUIDE.md)
# 3. Configure shared folder in GNOME Boxes
# 4. Set up SSH in VM
# 5. Initialize configuration
make vm-init

# 6. Set up VM environment
make vm-setup
```

### Daily Development
```bash
# Terminal 1: Watch logs
make vm-logs

# Terminal 2: Edit code
code .

# After saving changes:
# In VM: Alt+F2 → r → Enter (2-3 second reload!)
```

### Quick Install + Reload
```bash
# Combines install and reload attempt
make vm-dev
```

## Makefile Integration

All scripts are integrated with the Makefile:

- `make vm-network-setup` → `./scripts/vm-network-setup` (host networking)
- `make vm-init` → `./scripts/init-vm-config`
- `make vm-setup` → `./scripts/vm-setup`
- `make vm-install` → `./scripts/vm-install`
- `make vm-logs` → `./scripts/vm-logs`
- `make vm-dev` → `./scripts/vm-install` + reload message

## Documentation

- **Quick Start:** [docs/VM-SETUP-GUIDE.md](../docs/VM-SETUP-GUIDE.md)
- **Detailed Reference:** [memory/development/vm-workflow.md](../memory/development/vm-workflow.md)
- **Development Guide:** [DEVELOPMENT.md](../DEVELOPMENT.md)

## Troubleshooting

### "Configuration file not found"
Run `make vm-init` to create the configuration file.

### "Cannot connect to VM"
1. Verify VM is running
2. Check SSH is installed and running in VM
3. Verify IP address hasn't changed: `ip addr show` (in VM)
4. Test SSH: `ssh yourusername@192.168.122.XXX`

### "Shared folder not mounted"
1. In VM: `systemctl --user restart spice-webdavd`
2. Open Files in VM → Other Locations → Networks → Spice client folder
3. Verify shared folder is configured in GNOME Boxes

### VM can't access internet
1. Run `make vm-network-setup` on host
2. This fixes iptables rules blocked by Docker
3. See [vm-network-troubleshooting.md](../memory/development/vm-network-troubleshooting.md) for details

### Scripts don't execute
Make sure they're executable:
```bash
chmod +x scripts/init-vm-config scripts/vm-setup scripts/vm-install scripts/vm-logs scripts/vm-network-setup
chmod +x scripts/lib/distro-detect.sh
chmod +x scripts/vm-guest/auto-log-watcher.sh
```

## Contributing

To improve these scripts:
1. Test changes thoroughly across multiple systems
2. Maintain compatibility with the config file format
3. Provide clear error messages with actionable solutions
4. Update this README with any new functionality
