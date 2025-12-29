# Zoned Scripts Directory

This directory contains all scripts for VM development, testing, and utilities.

## Directory Structure

```
scripts/
├── vm                    # Main dispatcher - use this for all VM operations
├── user/                 # User-facing commands (called via ./scripts/vm dispatcher or directly)
│   ├── vm-setup          # Initial VM configuration
│   ├── vm-install        # Deploy to VM during development
│   ├── vm-logs           # Watch VM logs
│   ├── vm-profile        # Manage VM profiles
│   └── vm-headless       # Headless VM operations
├── util/                 # Utilities (rarely called directly)
│   ├── vm-network-setup
│   ├── vm-virtiofs-migrate
│   └── analyze-memory.py
├── lib/                  # Shared libraries
├── vm-guest/             # Scripts that run inside the VM
└── vm-test/              # Test infrastructure
```

## Quick Start

### Option 1: Using `./scripts/vm` directly

```bash
./scripts/vm --help          # Show all commands
./scripts/vm setup           # Setup a VM
./scripts/vm logs            # Watch VM logs
./scripts/vm profile list    # List VM profiles
./scripts/vm test func       # Run functional tests
```

### Option 2: With direnv (Recommended)

1. Install [direnv](https://direnv.net/)
2. Run `direnv allow` in the project root
3. Now just use `vm`:

```bash
vm setup
vm logs
vm profile list
vm test func quick
```

### Option 3: Set up an alias

Add to `~/.zshrc` or `~/.bashrc`:
```bash
alias vm='/path/to/zoned/scripts/vm'
```

## Common Commands

### Setup & Configuration
- `vm setup` - Configure a new VM or reconfigure existing
- `vm profile list` - Show all configured VMs
- `vm profile switch <name>` - Switch to a different VM
- `vm profile info` - Show active VM details
- `vm profile delete <name>` - Remove a VM profile

### Development
- `make vm-install` - Deploy extension to VM (lint + compile + reload)
- `vm logs` - Watch extension logs from VM
- `vm install` - Same as vm-install, but via dispatcher

### VM Control
- `vm headless start` - Start VM without display
- `vm headless stop`  - Stop VM
- `vm headless status` - Check VM status
- `vm headless display` - Attach display to running VM

### Testing
- `vm test func` - Interactive functional test menu
- `vm test func quick` - Quick smoke tests (~3-5 min)
- `vm test mem` - Interactive memory test menu
- `vm test mem standard` - Standard memory tests

### Utilities
- `vm network` - Configure host networking
- `vm virtiofs` - Migrate to virtiofs file sharing

## User vs Util Scripts

**User scripts** (`scripts/user/`):
- Frequently used commands
- Called via the `vm` dispatcher
- User-friendly interfaces

**Util scripts** (`scripts/util/`):
- One-time setup or troubleshooting
- Rarely needed
- Can be called directly if needed: `./scripts/util/vm-network-setup`

## Migrating from Old Commands

| Old Command | New Command |
|-------------|-------------|
| `make vm-setup` | `vm setup` |
| `./scripts/vm logs` | `vm logs` |
| `make vm-test-func` | `vm test func` |
| `make vm-test-mem` | `vm test mem` |
| `scripts/vm-profile list` | `vm profile list` |
| `make vm-install` | `make vm-install` (still works!) |

## Documentation

- **VM Setup Guide**: `docs/vm-setup-guide.md`
- **VM Profiles**: `docs/vm-profiles.md`
- **Testing Strategy**: `docs/testing-strategy.md`
- **VM Test README**: `scripts/vm-test/README.md`

## Contributing

When adding new VM scripts:
1. Place user-facing commands in `scripts/user/`
2. Place utilities in `scripts/util/`
3. Add routing in `scripts/vm` dispatcher
4. Update this README
5. Make scripts executable: `chmod +x scripts/user/new-script`
