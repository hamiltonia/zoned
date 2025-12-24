# VM Stability Tests

Automated stability tests for the Zoned GNOME Shell extension. These tests run inside a VM with a desktop session and test extension lifecycle, resource leaks, and UI stability.

For the reasoning behind these tests and how they work, see [docs/testing-strategy.md](../../docs/testing-strategy.md).

## Prerequisites

- A VM with GNOME Shell (see [vm-setup-guide.md](../../docs/vm-setup-guide.md))
- Zoned extension installed and enabled
- SSH access from host to VM configured

## Desktop Notifications

Tests automatically send desktop notifications when they complete, showing the test status (PASS/WARN/FAIL).

### VM-to-Host Notifications (Recommended)

When running tests in a VM, notifications will automatically be sent to your **host machine** so you can be notified when long-running tests complete while you work on other tasks.

**Setup (one-time):**

1. On the **host machine**, ensure SSH server is running:
   ```bash
   sudo systemctl enable --now sshd
   ```

2. **Inside the VM**, run the setup script:
   ```bash
   ./scripts/vm-test/setup-host-notifications.sh
   ```

This configures SSH from VM to host and tests the notification system. Once set up, all test notifications will appear on your host desktop instead of in the VM.

**How it works:**
- Tests detect they're running in a VM using `systemd-detect-virt`
- The gateway IP (host) is determined from the default route
- Notifications are sent via SSH to the host machine
- Falls back to local VM notifications if host is unreachable

**Notification types:**
- **PASS** (normal urgency, info icon) - Tests completed successfully
- **WARN** (normal urgency, warning icon) - Tests passed but with warnings (e.g., memory growth)
- **FAIL** (critical urgency, error icon) - Tests failed or leaked resources (persists until dismissed)

## Running Tests

### From Host (via Makefile)

```bash
# Full stability test suite
make vm-stability-test

# Quick mode (reduced iterations)
make vm-quick-test

# Long-haul soak test (extended duration)
make vm-long-haul DURATION=1h
```

### Inside VM

```bash
# Full stability mode
./scripts/vm-test/run-all.sh

# Quick mode
./scripts/vm-test/run-all.sh --quick

# Long-haul mode
./scripts/vm-test/run-all.sh --long-haul 8h
```

## Test Modes

### Stability Mode (default)

Full verification with substantial iterations per test. Use before releases or after significant changes.

### Quick Mode (`--quick`)

Reduced iterations for fast sanity checks during development.

### Long-Haul Mode (`--long-haul DURATION`)

Extended soak testing that cycles through all 9 tests repeatedly for the specified duration (e.g., `8h`, `30m`, `1h30m`).

**Features:**
- Per-test memory delta tracking to identify consistent leakers
- Statistical analysis (min/max/avg/stddev) to distinguish GC noise from real leaks
- Safety limits with automatic shutdown if memory exceeds thresholds
- CSV export to `results/` directory for external analysis
- Graceful abort with Ctrl+C (prints results gathered so far)

**Output interpretation:**
- `OK` - Memory oscillates around zero (healthy)
- `WARN` - High average growth but some negative deltas (investigate)
- `LEAK` - Always positive delta, never shrinks (likely a real leak)

**Exit codes:**
- `0` - No leaks detected
- `1` - Leaks detected (test ran successfully, found issues)
- `2` - Safety bailout (memory exceeded limits)
- `130` - Interrupted by Ctrl+C

## Test Suites

### 1. Enable/Disable Cycle (`test-enable-disable.sh`)

Tests extension lifecycle stability by enabling and disabling the extension repeatedly.

**What it tests:**
- Extension enable/disable without crashes
- Resource cleanup during disable
- Memory leak detection

### 2. UI Stress Test (`test-ui-stress.sh`)

Rapidly opens and closes UI components (LayoutSwitcher, ZoneOverlay) to test for memory leaks.

**What it tests:**
- LayoutSwitcher show/hide cycles
- ZoneOverlay show/hide cycles
- UI component cleanup

### 3. Zone Cycling (`test-zone-cycling.sh`)

Tests zone cycling operations for state consistency and stability.

**What it tests:**
- Rapid zone cycling in both directions
- State consistency (zone index stays valid)
- Layout state preservation

### 4. Layout Switching (`test-layout-switching.sh`)

Cycles through all available layouts to test layout switching stability.

**What it tests:**
- Layout switching between all layouts
- Zone index reset on layout change
- State consistency

### 5. Combined Stress (`test-combined-stress.sh`)

Interleaves multiple operations (layout switching, zone cycling, UI components) to simulate realistic usage patterns and test for race conditions.

**What it tests:**
- Concurrent operations stress
- Race conditions between different features
- Memory stability under mixed workload

### 6. Multi-Monitor (`test-multi-monitor.sh`)

Tests layout switching and zone cycling across multiple monitors. **Gracefully skips with success if only one monitor is available.**

**What it tests:**
- Multi-monitor layout handling
- UI component placement on correct monitor
- State consistency across monitors

### 7. Window Movement (`test-window-movement.sh`)

Tests actual window movement to zones using a GTK4 test window with D-Bus self-reporting.

**What it tests:**
- Window positioning to zone coordinates
- Geometry verification after moves
- Resource cleanup with real windows

**Requirements:**
- python3 with GTK4 (for test window)

### 8. Edge Cases (`test-edge-cases.sh`)

Tests boundary conditions and error handling for robustness.

**What it tests:**
- Invalid layout ID handling
- Zone cycling at boundaries (wrap-around)
- Rapid toggle operations
- Actions without focused window
- Double show/hide operations
- Invalid D-Bus parameters

### 9. Workspace Tests (`test-workspace.sh`)

Tests per-workspace layout functionality and workspace switching.

**What it tests:**
- Per-workspace mode enable/disable toggle
- Independent layouts per workspace
- Layout state preservation across workspace switches
- Rapid workspace cycling

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

When `debug-expose-dbus` is enabled, the extension exposes a D-Bus interface for test automation.

**Service:** `org.gnome.Shell`  
**Path:** `/org/gnome/Shell/Extensions/Zoned/Debug`  
**Interface:** `org.gnome.Shell.Extensions.Zoned.Debug`

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
├── test-window-movement.sh  # Window movement test
├── test-edge-cases.sh       # Edge case and boundary tests
├── test-workspace.sh        # Per-workspace layout tests
└── lib/
    ├── setup.sh             # Test setup and prerequisites
    ├── dbus-helpers.sh      # D-Bus interaction utilities
    ├── assertions.sh        # Test assertion functions
    └── test-window.py       # GTK4 test window with D-Bus
```

## See Also

- [testing-strategy.md](../../docs/testing-strategy.md) - Why and how these tests work
- [vm-setup-guide.md](../../docs/vm-setup-guide.md) - VM development setup
- [DEVELOPMENT.md](../../DEVELOPMENT.md) - Development workflow
