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

### 1. Enable/Disable Cycle (`test-enable-disable.sh`)

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

### 2. UI Stress Test (`test-ui-stress.sh`)

Rapidly opens and closes UI components (LayoutSwitcher, ZoneOverlay) to test for memory leaks.

**What it tests:**
- LayoutSwitcher show/hide cycles
- ZoneOverlay show/hide cycles
- UI component cleanup

**Arguments:**
- `iterations` - Number of open/close cycles per component (default: 50)

**Pass criteria:**
- No resource leaks after cycling
- Minimal memory growth

### 3. Zone Cycling (`test-zone-cycling.sh`)

Tests zone cycling operations for state consistency and stability.

**What it tests:**
- Rapid zone cycling in both directions
- State consistency (zone index stays valid)
- Layout state preservation

**Arguments:**
- `cycles` - Number of zone cycle operations (default: 500)

**Pass criteria:**
- Zone index always valid (0 to zoneCount-1)
- Layout unchanged during zone cycling
- No resource leaks

### 4. Layout Switching (`test-layout-switching.sh`)

Cycles through all available layouts to test layout switching stability.

**What it tests:**
- Layout switching between all layouts
- Zone index reset on layout change
- State consistency

**Arguments:**
- `cycles` - Number of full layout rotation cycles (default: 10)

**Pass criteria:**
- All layouts switch successfully
- No resource leaks
- Valid zone state after each switch

### 5. Combined Stress (`test-combined-stress.sh`)

Interleaves multiple operations (layout switching, zone cycling, UI components) to simulate realistic usage patterns and test for race conditions.

**What it tests:**
- Concurrent operations stress
- Race conditions between different features
- Memory stability under mixed workload

**Arguments:**
- `iterations` - Number of combined operation cycles (default: 100)

**Pass criteria:**
- State remains consistent throughout
- No resource leaks
- Memory growth < 10MB

### 6. Multi-Monitor (`test-multi-monitor.sh`)

Tests layout switching and zone cycling across multiple monitors. **Gracefully skips with success if only one monitor is available.**

**What it tests:**
- Multi-monitor layout handling
- UI component placement on correct monitor
- State consistency across monitors

**Arguments:**
- `iterations` - Number of test cycles per monitor (default: 25)

**Pass criteria:**
- Skips successfully on single-monitor (exit 0)
- No resource leaks on multi-monitor
- State consistency across monitors

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
├── README.md                # This file
├── run-all.sh               # Run complete test suite
├── test-enable-disable.sh   # Extension lifecycle test
├── test-ui-stress.sh        # UI component stress test
├── test-zone-cycling.sh     # Zone cycling test
├── test-layout-switching.sh # Layout switching test
├── test-combined-stress.sh  # Combined operations stress test
├── test-multi-monitor.sh    # Multi-monitor test
└── lib/
    ├── setup.sh             # Test setup and prerequisites
    ├── dbus-helpers.sh      # D-Bus interaction utilities
    └── assertions.sh        # Test assertion functions
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
