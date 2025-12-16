# VM Stability Tests

Automated stability tests for the Zoned GNOME Shell extension. These tests run inside a VM with a desktop session and test extension lifecycle, resource leaks, and UI stability.

## Prerequisites

- A VM with GNOME Shell (see [vm-setup-guide.md](../../docs/vm-setup-guide.md))
- Zoned extension installed and enabled
- SSH access from host to VM configured

## Running Tests

### From Host (via SSH)

```bash
# Run full stability test suite
make vm-stability-test

# Run quick subset (10 cycles instead of 50)
make vm-quick-test
```

### Inside VM

```bash
# Run all tests
./scripts/vm-test/run-all.sh

# Quick mode
./scripts/vm-test/run-all.sh --quick

# Run individual tests
./scripts/vm-test/test-enable-disable.sh 50 500
```

## Test Suites

### Enable/Disable Cycle (`test-enable-disable.sh`)

Tests extension lifecycle stability by enabling and disabling the extension repeatedly.

**What it tests:**
- Extension enable/disable without crashes
- Resource cleanup during disable
- Memory leak detection

**Arguments:**
- `cycles` - Number of enable/disable cycles (default: 50)
- `delay_ms` - Delay between operations in ms (default: 500)

**Pass criteria:**
- No resource leaks detected
- Memory growth < 10MB after all cycles

## Debug Features

The tests use two GSettings to enable debug functionality:

```bash
# Enable D-Bus debug interface (required for resource queries)
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true

# Enable resource tracking (tracks signals/timers)
gsettings set org.gnome.shell.extensions.zoned debug-track-resources true
```

These are automatically enabled by `run-all.sh`.

## D-Bus Interface

When `debug-expose-dbus` is enabled, the extension exposes a D-Bus interface:

**Service:** `org.gnome.Shell`  
**Path:** `/org/gnome/Shell/Extensions/Zoned/Debug`  
**Interface:** `org.gnome.Shell.Extensions.Zoned.Debug`

### Methods

| Method | Description |
|--------|-------------|
| `GetState()` | Get current extension state |
| `GetResourceReport()` | Get resource tracking report |
| `TriggerAction(action, params)` | Trigger an extension action |
| `ResetResourceTracking()` | Reset tracking counters |
| `Ping()` | Health check |

### Example

```bash
# Ping the interface
gdbus call -e -d org.gnome.Shell \
    -o /org/gnome/Shell/Extensions/Zoned/Debug \
    -m org.gnome.Shell.Extensions.Zoned.Debug.Ping

# Get resource report
gdbus call -e -d org.gnome.Shell \
    -o /org/gnome/Shell/Extensions/Zoned/Debug \
    -m org.gnome.Shell.Extensions.Zoned.Debug.GetResourceReport
```

## File Structure

```
scripts/vm-test/
├── README.md              # This file
├── run-all.sh             # Run complete test suite
├── test-enable-disable.sh # Extension lifecycle test
└── lib/
    ├── setup.sh           # Test setup and prerequisites
    ├── dbus-helpers.sh    # D-Bus interaction utilities
    └── assertions.sh      # Test assertion functions
```

## Adding New Tests

1. Create a new test script in `scripts/vm-test/`
2. Source the setup library: `source "$SCRIPT_DIR/lib/setup.sh"`
3. Use helper functions from `dbus-helpers.sh` and `assertions.sh`
4. Add to `run-all.sh`

### Example Test Template

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

echo "Running my test..."

# Your test logic here
ensure_dbus_available

for i in $(seq 1 10); do
    dbus_trigger "switch-layout" '{"layoutId": "halves"}'
    sleep_ms 100
    progress $i 10
done

report=$(dbus_get_resource_report)
assert_no_leaks "$report" "My test"

pass "My test completed"
print_summary
```

## See Also

- [stability-testing-spec.md](../../docs/stability-testing-spec.md) - Full testing specification
- [vm-setup-guide.md](../../docs/vm-setup-guide.md) - VM development setup
- [DEVELOPMENT.md](../../DEVELOPMENT.md) - Development workflow
