# Zoned Test Suite

Automated testing for the Zoned GNOME Shell extension. Tests run in a VM with a desktop session and validate extension behavior, memory stability, and resource cleanup.

For the reasoning behind these tests and how they work, see [docs/testing-strategy.md](../../docs/testing-strategy.md).

## Quick Start

**Prerequisites:**
- A VM with GNOME Shell running (see [vm-setup-guide.md](../../docs/vm-setup-guide.md))
- Zoned extension installed and enabled
- SSH access configured

**Run tests:**
```bash
# Quick memory test (recommended for feature work)
./scripts/run-tests mem --preset quick

# All functional tests
./scripts/run-tests func

# Quick release validation (~5-10 min)
./scripts/run-tests release-test

# Full release suite (memory deep + functional)
./scripts/run-tests release
```

## Test Runner Overview

The unified test runner `./scripts/run-tests` handles both local and VM testing.

**Two execution modes:**
- **Default**: Run in VM via SSH (recommended - most testing happens here)
- **--local**: Run on current machine (for quick local verification)

**Three test types:**
- **mem**: Memory leak detection with statistical analysis
- **func**: Functional correctness validation
- **release**: Complete suite (deep memory testing + all functional tests)

## Running Tests

### Memory Leak Testing

Tests for memory leaks using statistical correlation analysis across multiple runs with GNOME Shell restarts.

```bash
# Quick verification (1-4 min, recommended during feature work)
./scripts/run-tests mem --preset quick

# Standard testing (1-10 min, good coverage)
./scripts/run-tests mem --preset standard

# Deep analysis (1-20 min, for release prep)
./scripts/run-tests mem --preset deep

# Local execution (if extension installed locally)
./scripts/run-tests mem --local --preset quick
```

**How it works:**
- Runs enable/disable, LayoutSwitcher, and ZoneOverlay tests
- **Variable duration runs** (1min, 2min, 3min, 4min)
- **GNOME Shell restarts between runs** for clean baselines
- **Statistical R² correlation analysis** distinguishes real leaks from GC noise

**Output interpretation:**
- `PASS` - Memory stable across runs (variance <10 MB)
- `WARN` - High variance but no correlation (measurement noise, not a leak)
- `FAIL` - High variance AND strong correlation (R² > 0.8) = **confirmed leak**

### Functional Testing

Validates correctness of features using real GTK4 windows and D-Bus verification.

```bash
# Run all 6 functional test suites
./scripts/run-tests func

# Local execution
./scripts/run-tests func --local
```

**Test suites:**
1. **Edge Cases** - Error handling, invalid inputs, boundary conditions
2. **GSettings** - Settings persistence and default value verification
3. **Layout Switching** - Rapid layout changes, state consistency
4. **Multi-Monitor** - Multi-display handling (skips gracefully if single monitor)
5. **Window Movement** - Zone positioning accuracy with real GTK4 windows
6. **Workspace** - Per-workspace layout persistence
7. **Zone Cycling** - State consistency under rapid cycling

### Release Testing

Complete test suite for release validation.

```bash
# Full suite: deep memory testing + all functional tests
./scripts/run-tests release

# Local execution
./scripts/run-tests release --local
```

**What it runs:**
1. Memory tests with deep preset (1-20 min variable runs)
2. All 6 functional test suites
3. Full R² correlation analysis

## Test Suite Details

### Functional Tests

#### test-func-edge-cases.sh
**Purpose:** Validate error handling and boundary conditions

**What it tests:**
- Invalid layout IDs don't crash extension
- Zone cycling wraps correctly at boundaries
- Rapid toggle operations handle race conditions
- Actions without focused window fail gracefully
- Double show/hide operations are safe
- Invalid D-Bus parameters rejected properly

**Why it's valuable:** Memory tests don't validate error handling paths.

#### test-func-gsettings.sh
**Purpose:** Validate GSettings persistence and defaults

**What it tests:**
- Reading current settings succeeds
- Setting values persists correctly
- Default values restore properly
- Settings persist across extension disable/enable
- Original values restored after test

**Why it's valuable:** Ensures settings framework works correctly and data persists.

#### test-func-layout-switching.sh
**Purpose:** Validate layout state consistency

**What it tests:**
- 10 cycles through ALL available layouts rapidly
- Each layout switch succeeds
- State persists across switches
- No crashes or hangs

**Why it's valuable:** Different from leak detection - validates state correctness.

#### test-func-multi-monitor.sh
**Purpose:** Validate multi-display support

**What it tests:**
- Layout switching across monitors
- UI component placement on correct monitor
- State consistency with 2+ monitors

**Smart behavior:** Gracefully skips (returns success) if only 1 monitor detected.

**Why it's valuable:** Multi-monitor is a critical use case that memory tests don't cover.

#### test-func-window-movement.sh
**Purpose:** Validate zone positioning accuracy

**What it tests:**
- Real GTK4 windows move to correct zone positions
- Window geometry matches zone geometry (±50px tolerance)
- Resource cleanup after window operations

**Requires:** python3 with GTK4 (uses `lib/test-window.py`)

**Why it's valuable:** Tests core feature correctness with real windows, not just memory stability.

#### test-func-workspace.sh
**Purpose:** Validate per-workspace layout feature

**What it tests:**
- Per-workspace mode toggle (enable/disable)
- Independent layouts per workspace (Layout1 on WS0, Layout2 on WS1)
- State preservation across workspace switches
- Rapid workspace cycling stability

**Requires:** Real GTK4 window for workspace testing

**Why it's valuable:** This is a complete FEATURE not tested by memory tests.

#### test-func-zone-cycling.sh
**Purpose:** Validate zone state consistency

**What it tests:**
- 500 rapid zone cycles in both directions
- Zone index stays in valid range [0, zoneCount-1]
- Layout state doesn't change during cycling
- No state corruption under stress

**Why it's valuable:** State consistency verification, orthogonal to leak detection.

### Memory Test Implementation

The memory test is implemented in two layers:

**test-mem-with-restarts** (orchestrator)
- Runs multiple iterations with GNOME Shell restarts
- Calculates R² correlation between cycle count and memory growth
- Determines PASS/WARN/FAIL based on variance and correlation

**test-mem-monitored.sh** (single run)
- Executes one memory test run for specified duration
- Monitors memory in real-time with live updates
- Tests: Enable/Disable cycles, LayoutSwitcher, ZoneOverlay

## Desktop Notifications

Tests automatically send desktop notifications on completion.

### VM-to-Host Notifications (Recommended)

When running tests in VM, notifications automatically appear on your **host desktop** so you can work on other tasks while tests run.

**One-time setup:**

1. On **host machine**, ensure SSH server is running:
   ```bash
   sudo systemctl enable --now sshd
   ```

2. **Inside VM**, run setup script:
   ```bash
   ./scripts/tests/setup-host-notifications.sh
   ```

**Notification types:**
- **PASS** (normal urgency) - Tests completed successfully
- **WARN** (normal urgency) - Tests passed but with warnings (e.g., memory variance)
- **FAIL** (critical urgency) - Tests failed or detected leaks (persists until dismissed)

**How it works:**
- Tests detect VM using `systemd-detect-virt`
- Gateway IP (host) determined from default route
- Notifications sent via SSH to host machine
- Falls back to local VM notifications if host unreachable

## Debug Features

Tests use GSettings to enable debug functionality:

```bash
# Enable D-Bus debug interface (required for resource queries)
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true

# Enable resource tracking (tracks signals/timers)
gsettings set org.gnome.shell.extensions.zoned debug-track-resources true
```

These are automatically enabled by test scripts.

## D-Bus Interface

When `debug-expose-dbus` is enabled, the extension exposes a D-Bus interface for test automation.

**Service:** `org.gnome.Shell`  
**Path:** `/org/gnome/Shell/Extensions/Zoned/Debug`  
**Interface:** `org.gnome.Shell.Extensions.Zoned.Debug`

**Example commands:**
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

## D-Bus Testing Philosophy

**The Distinction:**
- ❌ **D-Bus to trigger user actions** - Bypasses keyboard → schema → extension pipeline (misses integration bugs)
- ✅ **D-Bus to validate results** - Appropriate for feature and correctness testing

**Why functional tests use D-Bus:**
These tests validate that features WORK correctly (orthogonal to leak detection):
- Edge case handling - D-Bus appropriate for testing invalid inputs
- Multi-monitor support - D-Bus appropriate for state verification
- Workspace features - D-Bus appropriate for feature validation
- Position accuracy - D-Bus appropriate for geometry verification

**Future improvement:**
Proper end-to-end testing should use real keyboard shortcuts (xdotool/ydotool) to test the full user interaction path. The recent schema/keyboard handling bug would have been caught immediately by proper automation using real keyboard shortcuts.

## File Structure

```
scripts/tests/
├── README.md                       # This file
│
├── test-mem-with-restarts          # Memory test orchestrator (multi-run + R²)
├── test-mem-monitored.sh           # Single memory test implementation
│
├── test-func-edge-cases.sh         # Functional test suites
├── test-func-layout-switching.sh
├── test-func-multi-monitor.sh
├── test-func-window-movement.sh
├── test-func-workspace.sh
├── test-func-zone-cycling.sh
│
├── test-actor-leak-check.sh        # Specialized diagnostic tests
├── test-correlation.sh
├── test-leak-diagnostic.sh
│
├── verify-extension-init.sh        # Infrastructure
├── xdotool-restart-gnome.sh
├── xdotool-force-gc.sh
├── memory-monitor.sh
├── setup-host-notifications.sh
│
└── lib/
    ├── setup.sh                    # Test initialization
    ├── dbus-helpers.sh             # D-Bus utilities
    ├── assertions.sh               # Assertion helpers
    └── test-window.py              # GTK4 test window
```

## Test Execution Flow

```
./scripts/run-tests (unified runner)
  │
  ├── mem → test-mem-with-restarts
  │           └── Calls test-mem-monitored.sh multiple times
  │               └── Variable duration (1min, 2min, 3min, 4min)
  │               └── GNOME Shell restarts between runs
  │               └── R² correlation analysis
  │
  ├── func → test-func-*.sh (all 6 tests sequentially)
  │
  └── release → mem (deep) + func (all)
```

## Advanced Testing (Future)

### Proper End-to-End Testing

**Requirements:**
- Real keyboard automation (xdotool for X11, ydotool for Wayland)
- Test full user interaction path
- Catch integration bugs (schema → keybinding → extension)

**Coverage needed:**
- Keyboard shortcuts (Super+Arrow, Super+1-9, Super+Z)
- Schema validation
- User workflows (open UI, select layout, verify change)
- Error handling (keybinding conflicts, missing layouts)

### Technology Options

- **xdotool** - X11 automation (current VM uses X11)
- **ydotool** - Wayland automation (future-proof)
- **dogtail** - GNOME accessibility automation
- **pytest + PyAutoGUI** - Python-based framework

## See Also

- [testing-strategy.md](../../docs/testing-strategy.md) - Testing philosophy and rationale
- [vm-setup-guide.md](../../docs/vm-setup-guide.md) - VM development environment setup
- [DEVELOPMENT.md](../../DEVELOPMENT.md) - Development workflow
- [TEST_REFACTOR_PLAN.md](../../TEST_REFACTOR_PLAN.md) - Test architecture history
