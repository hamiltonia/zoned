# Zoned Scripts Directory

This directory contains all scripts for VM development, testing, and utilities.

## Directory Structure

```
scripts/
├── vm                    # VM management dispatcher
├── run-tests             # Unified test runner for memory and functional tests
├── user/                 # User-facing commands (called via ./scripts/vm dispatcher or directly)
│   ├── vm-setup          # Initial VM configuration
│   ├── vm-install        # Deploy to VM during development
│   ├── vm-logs           # Watch VM logs
│   ├── vm-profile        # Manage VM profiles
│   └── vm-headless       # Headless VM operations
├── util/                 # Utilities (rarely called directly)
│   ├── vm-network-setup
│   └── analyze-memory.py
├── lib/                  # Shared libraries
├── vm-guest/             # Scripts that run inside the VM
└── tests/                # Test infrastructure (memory + functional tests)
```

## Quick Start

### Option 1: Direct Script Usage

```bash
./scripts/vm --help          # Show VM management commands
./scripts/vm setup           # Setup a VM
./scripts/vm logs            # Watch VM logs
./scripts/vm profile list    # List VM profiles

./scripts/run-tests mem --preset quick    # Run memory tests
./scripts/run-tests func                  # Run functional tests
./scripts/run-tests release               # Full test suite
```

### Option 2: With direnv (Recommended)

1. Install [direnv](https://direnv.net/)
2. Run `direnv allow` in the project root
3. Now just use short commands:

```bash
vm setup
vm logs
vm profile list

run-tests mem --preset quick
run-tests func
```

### Option 3: Set up aliases

Add to `~/.zshrc` or `~/.bashrc`:
```bash
alias vm='/path/to/zoned/scripts/vm'
alias run-tests='/path/to/zoned/scripts/run-tests'
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
- `./scripts/run-tests mem --preset quick` - Quick memory test (~6 min)
- `./scripts/run-tests mem --preset standard` - Standard memory test (~10-15 min)
- `./scripts/run-tests mem --preset deep` - Deep memory analysis (~30 min)
- `./scripts/run-tests func` - All functional tests
- `./scripts/run-tests release` - Full suite (for release prep)
- `./scripts/run-tests mem --local --preset quick` - Local execution

### Utilities
- `vm network` - Configure host networking

## User vs Util Scripts

**User scripts** (`scripts/user/`):
- Frequently used commands
- Called via the `vm` dispatcher
- User-friendly interfaces

**Util scripts** (`scripts/util/`):
- One-time setup or troubleshooting
- Rarely needed
- Can be called directly if needed: `./scripts/util/vm-network-setup`

## Documentation

- **VM Setup Guide**: `docs/vm-setup-guide.md`
- **VM Profiles**: `docs/vm-profiles.md`
- **Testing Strategy**: `docs/testing-strategy.md`
- **Test Suite README**: `scripts/tests/README.md`

## Contributing

When adding new VM scripts:
1. Place user-facing commands in `scripts/user/`
2. Place utilities in `scripts/util/`
3. Add routing in `scripts/vm` dispatcher
4. Update this README
5. Make scripts executable: `chmod +x scripts/user/new-script`