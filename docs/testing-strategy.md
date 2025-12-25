# Testing Strategy

This document explains the **why** behind Zoned's testing infrastructure. For operational details (how to run tests, command options), see [scripts/vm-test/README.md](../scripts/vm-test/README.md).

## Why Stability Testing?

GNOME Shell extensions run in the same process as the shell itself. A memory leak in an extension becomes a memory leak in your entire desktop session. Users notice when their system slows down after a few days of uptime.

The primary goal is **leak detection** - finding resources that aren't properly cleaned up during extension lifecycle events (enable/disable) or UI operations (opening/closing dialogs).

### The Core Problem

Extensions must manually track and clean up:
- **Signal connections** (GObject signals like `settings.connect('changed')`)
- **Timers** (GLib timeouts and intervals)
- **Actors** (UI elements added to the stage)

Forgetting to disconnect a signal or remove a timer means those resources persist beyond their intended lifetime. Over thousands of enable/disable cycles, this compounds into visible memory growth.

## Testing Architecture

```
Test Scripts (bash)
    ↓
D-Bus Debug Interface (extension/utils/debugInterface.js)
    ↓
Resource Tracking System (extension/utils/resourceTracker.js)
    ↓
Extension Components
```

### Why D-Bus?

Tests run outside GNOME Shell but need to query internal extension state. D-Bus provides:
- Clean IPC without modifying the shell itself
- Structured queries for resource counts and state
- Action triggering (switch layout, cycle zone, etc.)

The interface is only exposed when `debug-expose-dbus` is enabled - production users never see it.

### Why ResourceTracker?

Instead of manually tracking `connect()`/`disconnect()` calls throughout the codebase, components use a centralized tracker:
- Automatic counting of active resources
- Warning logs when `destroy()` is called with unreleased resources
- Aggregated reporting via D-Bus for test scripts

Components integrate by using `tracker.connectSignal()` instead of raw `object.connect()`.

## Three Test Modes

```bash
# Stability mode (default) - full verification
make vm-stability-test

# Quick mode - fast sanity check
make vm-quick-test

# Long-haul mode - extended soak test
make vm-long-haul DURATION=2h
```

### Stability Mode (default)

**Purpose:** Full verification before releases or after significant changes.

Runs all 9 test suites with substantial iterations. Takes ~5-10 minutes depending on system. This is the baseline for "does this code leak memory?"

### Quick Mode (`--quick`)

**Purpose:** Fast sanity check during development.

Reduces iterations across all tests. Takes ~1-2 minutes. Use this for rapid iteration when you're actively debugging - it won't catch subtle leaks but will catch obvious regressions.

### Long-Haul Mode (`--long-haul DURATION`)

**Purpose:** Extended soak testing to find slow leaks.

Runs all 9 tests in a continuous cycle for hours. Each cycle measures per-test memory delta to identify **consistent leakers** - tests where memory always grows, never shrinks (GC fluctuation vs. real leaks).

Key features:
- **Per-test tracking:** Identifies which specific test consistently leaks
- **Statistical analysis:** Min/max/avg/stddev per test to distinguish GC noise from real leaks
- **Safety limits:** Automatic shutdown if memory exceeds thresholds
- **CSV export:** Raw data for external analysis

A test is flagged as a "LEAK" if its minimum delta is always positive (never shrinks between cycles) and average growth exceeds a threshold. This distinguishes from GC timing variations.

## Success Criteria Philosophy

### What "No Leaks" Means

- **Per-test:** Memory delta should oscillate around zero over many cycles
- **Suite-wide:** Total memory growth under threshold after all tests
- **Long-haul:** No test consistently shows positive-only deltas

### Why Memory Thresholds?

GC is non-deterministic. Small positive deltas are normal. We use thresholds:
- **Warning threshold:** Investigate, might be GC timing
- **Fail threshold:** Action required, likely a real leak

The thresholds are configurable via environment variables for tuning based on observed behavior.

## Test Coverage

| Test | What It Stresses | Leak Risk |
|------|-----------------|-----------|
| Enable/Disable | Full lifecycle cleanup | High - catches most leaks |
| UI Stress | LayoutSwitcher/ZoneOverlay open/close | High - UI components are complex |
| Zone Cycling | Rapid zone switching | Low - state updates only |
| Layout Switching | Layout changes and state persistence | Medium - involves zone recreation |
| Combined Stress | Interleaved operations | Medium - race conditions |
| Multi-Monitor | Per-monitor handling | Medium - additional state |
| Window Movement | Actual window positioning | Low - minimal extension state |
| Edge Cases | Boundary conditions, error paths | Medium - cleanup on errors |
| Workspace | Per-workspace layout state | Medium - workspace lifecycle |

## Future Considerations

### CI Integration

Some tests could run in GitHub Actions with virtual frame buffers, but the full suite requires a real GNOME Shell session. The current approach prioritizes accurate leak detection over CI convenience.

### Performance Testing

Memory is the current focus. Performance (frame timing, input latency) is a future concern once memory stability is solid.

## See Also

- [scripts/vm-test/README.md](../scripts/vm-test/README.md) - Operational guide for running tests
- [vm-setup-guide.md](vm-setup-guide.md) - VM development environment setup
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Development workflow
