# VM Profile System

The VM profile system allows you to easily switch between multiple test VMs without re-running the full setup process each time.

## Overview

Profiles store all the information needed to connect to and work with a VM:
- VM domain name (libvirt identifier)
- IP address
- SSH configuration
- File sharing type (virtiofs or SPICE)
- Mount path

## Usage

### Viewing Profiles

List all configured VM profiles:
```bash
scripts/vm-profile list
```

View active profile details:
```bash
scripts/vm-profile info
```

View specific profile:
```bash
scripts/vm-profile info fedora-40
```

### Switching Between VMs

Once you've set up multiple VMs with `make vm-setup`, you can quickly switch between them:

```bash
# Switch to a different VM
scripts/vm-profile switch ubuntu-24-04

# Now all vm-* commands target the new VM
make vm-install
./scripts/vm logs
```

### Creating Profiles

Profiles are created automatically when you run `make vm-setup`. The profile name is derived from the VM's domain name.

Example workflow:
```bash
# Start first VM in GNOME Boxes
make vm-setup           # Creates profile (e.g., "fedora-40")

# Start second VM
make vm-setup           # Creates another profile (e.g., "ubuntu-2404")

# Switch between them
scripts/vm-profile switch fedora-40
make vm-install             # Deploys to Fedora VM

scripts/vm-profile switch ubuntu-2404
make vm-install             # Deploys to Ubuntu VM
```

## Profile Storage

Profiles are stored in `.vm-profiles/` directory (gitignored):
```
.vm-profiles/
  ├── fedora-40.profile
  ├── ubuntu-2404.profile
  └── active            # Symlink to currently active profile
```

Each profile file contains:
- VM connection details
- File sharing configuration
- Last updated timestamp

## Legacy Cache Migration

The old `.vm-cache` file is automatically migrated to the new profile system on first run. The legacy cache system only supported one VM at a time.

## Benefits

1. **Quick Switching**: Change target VM instantly without re-setup
2. **Multi-VM Testing**: Easily test across different distributions
3. **Persistent Config**: VM configurations survive host reboots
4. **Clean Workflow**: Run `make vm-install` without worrying about which VM is active

## Advanced Usage

### Profile for Specific Use Cases

You can maintain profiles for different testing scenarios:
- `fedora-test` - General testing
- `ubuntu-stable` - Stable release testing
- `arch-bleeding` - Latest features testing

### Integration with Scripts

All vm-* scripts automatically use the active profile:
- `make vm-install` - Deploy to active VM
- `./scripts/vm logs` - View logs from active VM
- `scripts/vm-test/*` - Run tests in active VM
