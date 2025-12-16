# Stability Testing Specification

**Version:** 1.0  
**Status:** Draft  
**Created:** 2025-12-16

## Overview

This document specifies the stability testing infrastructure for the Zoned GNOME Shell extension. The goal is to detect memory leaks, resource leaks, and stability issues before they affect users' GNOME Shell sessions.

### Goals

1. **Detect memory leaks** - Identify unreleased resources during enable/disable cycles
2. **Detect signal leaks** - Find disconnected signal handlers
3. **Stress test UI components** - Verify rapid open/close doesn't crash GNOME
4. **Automate testing** - Enable repeatable test runs via scripts
5. **Support future CI** - Define which tests can run in GitHub Actions

### Non-Goals

- Full functional regression testing (future work)
- Performance benchmarking
- Cross-version GNOME compatibility testing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Stability Testing Stack                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Test Scripts (Host/VM)                         ││
│  │  scripts/vm-test/*.sh                                       ││
│  │  - run-all.sh, test-enable-disable.sh, etc.                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              D-Bus Debug Interface                          ││
│  │  org.gnome.Shell.Extensions.Zoned.Debug                     ││
│  │  - GetState(), TriggerAction(), GetResourceReport()         ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Resource Tracking System                       ││
│  │  extension/utils/resourceTracker.js                         ││
│  │  - SignalTracker, TimerTracker, ActorTracker                ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Extension Components                           ││
│  │  All managers integrated with resource tracking             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## GSettings Additions

New keys to add to `org.gnome.shell.extensions.zoned.gschema.xml`:

```xml
<!-- Debug/Testing Settings -->
<key name="debug-expose-dbus" type="b">
  <default>false</default>
  <summary>Expose D-Bus debug interface</summary>
  <description>
    When enabled, exposes the org.gnome.Shell.Extensions.Zoned.Debug
    D-Bus interface for automated testing. This allows external scripts
    to trigger actions and query extension state.
    
    Security: Only enable during development/testing. The interface
    allows triggering any extension action.
  </description>
</key>

<key name="debug-track-resources" type="b">
  <default>false</default>
  <summary>Enable resource leak tracking</summary>
  <description>
    When enabled, tracks all signal connections, timers, and actors
    to detect potential memory leaks. Adds slight performance overhead.
    
    Resource warnings are logged when destroy() is called with
    unreleased resources.
  </description>
</key>
```

### Settings Matrix

| Setting | Purpose | When to Enable |
|---------|---------|----------------|
| `developer-mode-revealed` | Show Developer section in prefs | Manual debugging |
| `debug-logging` | Verbose console output | Debugging specific issues |
| `debug-expose-dbus` | D-Bus test interface | Automated testing |
| `debug-track-resources` | Resource leak detection | Stability testing |

**Independent Controls:** Each setting operates independently. You can:
- Track resources without verbose logging
- Expose D-Bus without resource tracking
- Use any combination

---

## File Structure

```
extension/
├── utils/
│   ├── debug.js                 # Existing - logging utilities
│   ├── resourceTracker.js       # NEW - Resource tracking system
│   └── debugInterface.js        # NEW - D-Bus debug interface

scripts/
├── vm-test/                     # NEW - VM-based stability tests
│   ├── README.md               # Test documentation
│   ├── run-all.sh              # Run complete test suite
│   ├── test-enable-disable.sh  # Extension lifecycle test
│   ├── test-ui-stress.sh       # UI open/close stress test
│   ├── test-zone-cycling.sh    # Zone operation stress test
│   ├── test-layout-switching.sh # Layout change stress test
│   ├── test-memory-baseline.sh # Record memory baseline
│   └── lib/
│       ├── dbus-helpers.sh     # D-Bus interaction utilities
│       ├── assertions.sh       # Test assertion functions
│       └── setup.sh            # Test environment setup

tests/
├── LAYOUTSWITCHER_MANUAL_TESTS.md  # Existing
├── unit/                       # NEW - CI-compatible unit tests
│   ├── layoutConverter.test.js # Pure JS tests
│   └── ...
└── STABILITY_TESTS.md          # NEW - Stability test documentation
```

---

## Component Specifications

### 1. ResourceTracker (`extension/utils/resourceTracker.js`)

Centralized resource tracking for leak detection.

#### Public API

```javascript
/**
 * ResourceTracker - Tracks signals, timers, and actors for leak detection
 * 
 * Usage:
 *   const tracker = new ResourceTracker('ComponentName');
 *   
 *   // Track signal connection
 *   tracker.connectSignal(settings, 'changed::foo', callback);
 *   
 *   // Track timer
 *   tracker.addTimeout(GLib.PRIORITY_DEFAULT, 1000, callback);
 *   
 *   // Track actors (optional, for UI components)
 *   tracker.trackActor(myActor);
 *   
 *   // On destroy - disconnects all and warns about leaks
 *   tracker.destroy();
 */

export class ResourceTracker {
    constructor(componentName) {}
    
    // Signal tracking (wraps GObject.connect)
    connectSignal(object, signalName, callback) → signalId
    disconnectSignal(object, signalId) → void
    disconnectAllSignals() → void
    
    // Timer tracking (wraps GLib.timeout_add)
    addTimeout(priority, intervalMs, callback) → sourceId
    addTimeoutSeconds(priority, seconds, callback) → sourceId
    removeTimeout(sourceId) → void
    removeAllTimeouts() → void
    
    // Actor tracking (for UI components)
    trackActor(actor) → void
    untrackActor(actor) → void
    
    // Lifecycle
    destroy() → void  // Cleans up all, logs warnings for leaks
    
    // Reporting
    getReport() → ResourceReport
    hasLeaks() → boolean
}

/**
 * ResourceReport structure
 */
interface ResourceReport {
    componentName: string;
    signals: {
        active: number;
        total: number;
        leaked: SignalInfo[];
    };
    timers: {
        active: number;
        total: number;
        leaked: TimerInfo[];
    };
    actors: {
        active: number;
        total: number;
    };
    warnings: string[];
}
```

#### Implementation Notes

- Uses `WeakRef` where possible to avoid preventing garbage collection
- Stores stack traces (in debug mode) for leak source identification
- Thread-safe (GJS is single-threaded, but be defensive)
- Minimal overhead when `debug-track-resources = false`

#### Integration Pattern

Each component integrates like this:

```javascript
// In component constructor
import {ResourceTracker} from './utils/resourceTracker.js';

class MyComponent {
    constructor() {
        this._tracker = new ResourceTracker('MyComponent');
        
        // Instead of: this._settingsChangedId = settings.connect(...)
        this._tracker.connectSignal(settings, 'changed::foo', () => {...});
        
        // Instead of: GLib.timeout_add(...)
        this._tracker.addTimeout(GLib.PRIORITY_DEFAULT, 1000, () => {...});
    }
    
    destroy() {
        // Instead of manual disconnect for each signal
        this._tracker.destroy(); // Handles all, warns on leaks
    }
}
```

---

### 2. D-Bus Debug Interface (`extension/utils/debugInterface.js`)

Exposes extension internals for automated testing.

#### D-Bus Interface Definition

```xml
<interface name="org.gnome.Shell.Extensions.Zoned.Debug">
    <!-- State Queries -->
    <method name="GetState">
        <arg direction="out" type="a{sv}" name="state"/>
    </method>
    
    <method name="GetResourceReport">
        <arg direction="out" type="a{sv}" name="report"/>
    </method>
    
    <method name="GetComponentReports">
        <arg direction="out" type="aa{sv}" name="reports"/>
    </method>
    
    <!-- Actions -->
    <method name="TriggerAction">
        <arg direction="in" type="s" name="action"/>
        <arg direction="in" type="a{sv}" name="params"/>
        <arg direction="out" type="b" name="success"/>
        <arg direction="out" type="s" name="error"/>
    </method>
    
    <method name="ResetResourceTracking">
        <arg direction="out" type="b" name="success"/>
    </method>
    
    <!-- Signals -->
    <signal name="ActionCompleted">
        <arg type="s" name="action"/>
        <arg type="b" name="success"/>
    </signal>
</interface>
```

#### Method Specifications

**GetState()**
Returns current extension state:
```javascript
{
    enabled: true,
    layoutId: "halves",
    zoneIndex: 0,
    layoutCount: 8,
    workspaceMode: false,
    debugLogging: true,
    resourceTracking: true,
    gnomeVersion: "47.0",
    extensionVersion: "1.0"
}
```

**GetResourceReport()**
Returns aggregated resource tracking report:
```javascript
{
    totalSignals: 45,
    activeSignals: 12,
    leakedSignals: 0,
    totalTimers: 5,
    activeTimers: 1,
    leakedTimers: 0,
    componentsWithLeaks: [],
    warnings: []
}
```

**GetComponentReports()**
Returns per-component resource reports (array of reports).

**TriggerAction(action, params)**
Available actions:
| Action | Params | Description |
|--------|--------|-------------|
| `cycle-zone` | `{direction: 1 or -1}` | Cycle to next/prev zone |
| `switch-layout` | `{layoutId: "string"}` | Switch to layout |
| `show-layout-switcher` | `{}` | Open Layout Switcher |
| `hide-layout-switcher` | `{}` | Close Layout Switcher |
| `show-zone-editor` | `{layoutId?: "string"}` | Open Zone Editor |
| `hide-zone-editor` | `{}` | Close Zone Editor |
| `toggle-feature` | `{feature: "string", enabled: bool}` | Toggle a feature |

Returns `{success: bool, error: string}`.

**ResetResourceTracking()**
Clears all tracking counters for fresh measurement.

#### Security Model

The D-Bus interface is:
1. **Only exported when `debug-expose-dbus = true`**
2. **Not registered with the session bus in production**
3. **Logs all incoming requests when `debug-logging = true`**

#### Object Path

`/org/gnome/Shell/Extensions/Zoned/Debug`

---

### 3. Test Scripts (`scripts/vm-test/`)

Shell scripts for automated stability testing, designed to run inside the VM via SSH.

#### Test: Enable/Disable Cycle (`test-enable-disable.sh`)

```bash
#!/bin/bash
# Test extension lifecycle stability
# Pass: No memory leaks after N enable/disable cycles

CYCLES=${1:-50}
DELAY_MS=${2:-500}

source "$(dirname "$0")/lib/setup.sh"
source "$(dirname "$0")/lib/assertions.sh"

# Record baseline
baseline_memory=$(get_gnome_shell_memory)

for i in $(seq 1 $CYCLES); do
    gnome-extensions disable zoned@hamiltonia.me
    sleep_ms $DELAY_MS
    gnome-extensions enable zoned@hamiltonia.me
    sleep_ms $DELAY_MS
    
    # Check via D-Bus if available
    if dbus_interface_available; then
        report=$(dbus_get_resource_report)
        leaked=$(echo "$report" | jq '.leakedSignals + .leakedTimers')
        if [ "$leaked" -gt 0 ]; then
            fail "Cycle $i: $leaked resources leaked"
        fi
    fi
    
    progress $i $CYCLES
done

# Compare memory
final_memory=$(get_gnome_shell_memory)
memory_diff=$((final_memory - baseline_memory))

if [ $memory_diff -gt 10000 ]; then  # 10MB threshold
    warn "Memory grew by ${memory_diff}KB after $CYCLES cycles"
fi

pass "Completed $CYCLES enable/disable cycles"
```

#### Test: UI Stress (`test-ui-stress.sh`)

```bash
#!/bin/bash
# Stress test UI components
# Pass: No crashes, no leaked resources

ITERATIONS=${1:-100}

source "$(dirname "$0")/lib/setup.sh"
source "$(dirname "$0")/lib/assertions.sh"

ensure_dbus_available

# Test Layout Switcher
echo "Testing Layout Switcher (open/close $ITERATIONS times)..."
dbus_reset_tracking

for i in $(seq 1 $ITERATIONS); do
    dbus_trigger "show-layout-switcher" "{}"
    sleep_ms 100
    dbus_trigger "hide-layout-switcher" "{}"
    sleep_ms 50
    progress $i $ITERATIONS
done

report=$(dbus_get_resource_report)
assert_no_leaks "$report" "LayoutSwitcher stress test"

# Test Zone Editor  
echo "Testing Zone Editor (open/close $((ITERATIONS/2)) times)..."
dbus_reset_tracking

for i in $(seq 1 $((ITERATIONS/2))); do
    dbus_trigger "show-zone-editor" "{}"
    sleep_ms 200
    dbus_trigger "hide-zone-editor" "{}"
    sleep_ms 100
    progress $i $((ITERATIONS/2))
done

report=$(dbus_get_resource_report)
assert_no_leaks "$report" "ZoneEditor stress test"

pass "UI stress test complete"
```

#### Test: Zone Cycling (`test-zone-cycling.sh`)

```bash
#!/bin/bash
# Test zone cycling operations
# Pass: State remains consistent after many operations

CYCLES=${1:-500}

source "$(dirname "$0")/lib/setup.sh"
source "$(dirname "$0")/lib/assertions.sh"

ensure_dbus_available

# Get initial state
initial_state=$(dbus_get_state)
initial_layout=$(echo "$initial_state" | jq -r '.layoutId')
zone_count=$(echo "$initial_state" | jq -r '.zoneCount // 4')

echo "Testing zone cycling ($CYCLES operations, $zone_count zones)..."

for i in $(seq 1 $CYCLES); do
    direction=$((RANDOM % 2 * 2 - 1))  # -1 or 1
    dbus_trigger "cycle-zone" "{\"direction\": $direction}"
    sleep_ms 10
    
    # Every 100 cycles, verify state consistency
    if [ $((i % 100)) -eq 0 ]; then
        state=$(dbus_get_state)
        layout=$(echo "$state" | jq -r '.layoutId')
        zone=$(echo "$state" | jq -r '.zoneIndex')
        
        assert_equals "$layout" "$initial_layout" "Layout should not change"
        assert_in_range "$zone" 0 $((zone_count - 1)) "Zone index in range"
        progress $i $CYCLES
    fi
done

# Check for resource leaks
report=$(dbus_get_resource_report)
assert_no_leaks "$report" "Zone cycling test"

pass "Zone cycling test complete"
```

#### Test: Layout Switching (`test-layout-switching.sh`)

```bash
#!/bin/bash
# Test layout switching
# Pass: All layouts accessible, state persists

source "$(dirname "$0")/lib/setup.sh"
source "$(dirname "$0")/lib/assertions.sh"

ensure_dbus_available

state=$(dbus_get_state)
layouts=$(echo "$state" | jq -r '.layouts[]')
layout_count=$(echo "$state" | jq -r '.layoutCount')

echo "Testing layout switching ($layout_count layouts, 10 full cycles)..."

for cycle in $(seq 1 10); do
    for layoutId in $layouts; do
        dbus_trigger "switch-layout" "{\"layoutId\": \"$layoutId\"}"
        sleep_ms 50
        
        # Verify layout changed
        current=$(dbus_get_state | jq -r '.layoutId')
        assert_equals "$current" "$layoutId" "Layout should be $layoutId"
    done
    progress $cycle 10
done

# Check for resource leaks
report=$(dbus_get_resource_report)
assert_no_leaks "$report" "Layout switching test"

pass "Layout switching test complete"
```

#### Helper Library (`scripts/vm-test/lib/dbus-helpers.sh`)

```bash
#!/bin/bash
# D-Bus helper functions for stability tests

DBUS_DEST="org.gnome.Shell.Extensions.Zoned.Debug"
DBUS_PATH="/org/gnome/Shell/Extensions/Zoned/Debug"
DBUS_IFACE="org.gnome.Shell.Extensions.Zoned.Debug"

dbus_interface_available() {
    gdbus introspect -e -d "$DBUS_DEST" -o "$DBUS_PATH" &>/dev/null
}

dbus_call() {
    local method=$1
    local args=${2:-""}
    gdbus call -e -d "$DBUS_DEST" -o "$DBUS_PATH" -m "${DBUS_IFACE}.${method}" $args
}

dbus_get_state() {
    dbus_call "GetState" | parse_variant_dict
}

dbus_get_resource_report() {
    dbus_call "GetResourceReport" | parse_variant_dict
}

dbus_trigger() {
    local action=$1
    local params=$2
    dbus_call "TriggerAction" "\"$action\" $params"
}

dbus_reset_tracking() {
    dbus_call "ResetResourceTracking"
}

# Convert GVariant output to JSON-ish format
parse_variant_dict() {
    # Simple parsing - improve as needed
    sed -e 's/(/[/g' -e 's/)/]/g' -e "s/'/\"/g"
}
```

#### Helper Library (`scripts/vm-test/lib/assertions.sh`)

```bash
#!/bin/bash
# Test assertion functions

PASS_COUNT=0
FAIL_COUNT=0

pass() {
    echo -e "\e[32m✓ PASS:\e[0m $1"
    ((PASS_COUNT++))
}

fail() {
    echo -e "\e[31m✗ FAIL:\e[0m $1"
    ((FAIL_COUNT++))
    exit 1
}

warn() {
    echo -e "\e[33m⚠ WARN:\e[0m $1"
}

progress() {
    local current=$1
    local total=$2
    printf "\r  Progress: %d/%d (%d%%)" $current $total $((current * 100 / total))
    if [ $current -eq $total ]; then
        echo ""
    fi
}

assert_equals() {
    local actual=$1
    local expected=$2
    local msg=$3
    if [ "$actual" != "$expected" ]; then
        fail "$msg: expected '$expected', got '$actual'"
    fi
}

assert_in_range() {
    local value=$1
    local min=$2
    local max=$3
    local msg=$4
    if [ "$value" -lt "$min" ] || [ "$value" -gt "$max" ]; then
        fail "$msg: $value not in range [$min, $max]"
    fi
}

assert_no_leaks() {
    local report=$1
    local context=$2
    local leaked=$(echo "$report" | jq '.leakedSignals + .leakedTimers')
    if [ "$leaked" -gt 0 ]; then
        fail "$context: $leaked resources leaked"
    fi
}

get_gnome_shell_memory() {
    # Get GNOME Shell RSS in KB
    ps -o rss= -p $(pgrep -f gnome-shell) | head -1 | tr -d ' '
}

sleep_ms() {
    local ms=$1
    sleep $(echo "scale=3; $ms / 1000" | bc)
}
```

#### Main Runner (`scripts/vm-test/run-all.sh`)

```bash
#!/bin/bash
# Run all stability tests

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

echo "========================================"
echo "  Zoned Stability Test Suite"
echo "========================================"
echo ""

# Ensure prerequisites
check_prerequisites

# Enable debug features
echo "Enabling debug features..."
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true
gsettings set org.gnome.shell.extensions.zoned debug-track-resources true

# Give extension time to set up D-Bus
sleep 2

# Run tests
echo ""
echo "--- Test 1: Enable/Disable Cycle ---"
"$SCRIPT_DIR/test-enable-disable.sh" 50

echo ""
echo "--- Test 2: UI Stress Test ---"
"$SCRIPT_DIR/test-ui-stress.sh" 50

echo ""
echo "--- Test 3: Zone Cycling ---"
"$SCRIPT_DIR/test-zone-cycling.sh" 200

echo ""
echo "--- Test 4: Layout Switching ---"
"$SCRIPT_DIR/test-layout-switching.sh"

# Disable debug features
echo ""
echo "Disabling debug features..."
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false
gsettings set org.gnome.shell.extensions.zoned debug-track-resources false

echo ""
echo "========================================"
echo "  All Tests Passed!"
echo "========================================"
```

---

## CI-Compatible Tests

Tests that can run in GitHub Actions without a full GNOME Shell environment.

### 1. ESLint (Existing)

```yaml
# .github/workflows/lint.yml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
```

### 2. Schema Validation (New)

```yaml
# Part of CI workflow
- name: Validate GSettings Schema
  run: |
    glib-compile-schemas --strict extension/schemas/
```

### 3. Unit Tests for Pure Functions (New)

Location: `tests/unit/`

These test pure JavaScript functions that don't require GI bindings:

```javascript
// tests/unit/layoutConverter.test.js
import { zonesToEdges, edgesToZones } from '../../extension/utils/layoutConverter.js';

describe('layoutConverter', () => {
    test('zonesToEdges creates correct edge count', () => {
        const zones = [
            { x: 0, y: 0, w: 0.5, h: 1 },
            { x: 0.5, y: 0, w: 0.5, h: 1 }
        ];
        const edges = zonesToEdges(zones);
        expect(edges.length).toBe(5); // 4 outer + 1 inner
    });
    
    test('edgesToZones roundtrip', () => {
        const original = [
            { x: 0, y: 0, w: 0.5, h: 1 },
            { x: 0.5, y: 0, w: 0.5, h: 1 }
        ];
        const edges = zonesToEdges(original);
        const restored = edgesToZones(edges);
        expect(restored).toEqual(original);
    });
});
```

CI workflow:
```yaml
- name: Run Unit Tests
  run: npm test
```

### 4. Import Validation (New)

Verify all modules parse without errors (doesn't execute code):

```yaml
- name: Validate JS Syntax
  run: |
    for f in extension/*.js extension/**/*.js; do
      node --check "$f" 2>&1 | grep -v "Cannot find module" || true
    done
```

---

## Integration Points

### Components Requiring ResourceTracker Integration

| Component | Signal Count | Timer Count | Priority |
|-----------|--------------|-------------|----------|
| `extension.js` | 4 | 0 | High |
| `keybindingManager.js` | 2 | 0 | High |
| `layoutManager.js` | 0 | 0 | Low |
| `spatialStateManager.js` | 0 | 0 | Low |
| `panelIndicator.js` | 0-2 | 0 | Medium |
| `layoutSwitcher.js` | 5+ | 1+ | High |
| `zoneEditor.js` | 5+ | 1+ | High |
| `zoneOverlay.js` | 1 | 1 | Medium |
| `notificationManager.js` | 1 | 1 | Medium |
| `layoutSettingsDialog.js` | 2+ | 0 | Medium |
| `prefs.js` | 2+ per row | 0 | Medium |

### Integration Order

1. **Phase 1:** Core infrastructure
   - `resourceTracker.js` - Create tracker utility
   - `debugInterface.js` - Create D-Bus interface
   - `extension.js` - Wire up D-Bus, integrate tracker

2. **Phase 2:** High-priority components
   - `keybindingManager.js`
   - `layoutSwitcher.js`
   - `zoneEditor.js`

3. **Phase 3:** Remaining components
   - All other UI components
   - `prefs.js` (separate process, may need different approach)

---

## Makefile Additions

```makefile
# Stability Testing
.PHONY: vm-stability-test vm-quick-test

vm-stability-test: ## Run full stability test suite in VM
	@echo "Running stability tests in VM..."
	ssh $(VM_HOST) 'cd $(VM_ZONED_PATH) && ./scripts/vm-test/run-all.sh'

vm-quick-test: ## Run quick subset of stability tests
	@echo "Running quick stability tests..."
	ssh $(VM_HOST) 'cd $(VM_ZONED_PATH) && ./scripts/vm-test/test-enable-disable.sh 10'

vm-enable-debug: ## Enable debug features in VM
	ssh $(VM_HOST) 'gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true && \
	                gsettings set org.gnome.shell.extensions.zoned debug-track-resources true'

vm-disable-debug: ## Disable debug features in VM
	ssh $(VM_HOST) 'gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false && \
	                gsettings set org.gnome.shell.extensions.zoned debug-track-resources false'
```

---

## Success Criteria

### For v1.0 Release

1. **Enable/Disable Cycle**
   - [ ] 50 cycles with no resource leaks
   - [ ] Memory growth < 10MB after 50 cycles

2. **UI Stress**
   - [ ] LayoutSwitcher: 100 open/close with no leaks
   - [ ] ZoneEditor: 50 open/close with no leaks

3. **Zone Cycling**
   - [ ] 500 operations with consistent state
   - [ ] No resource leaks

4. **Layout Switching**
   - [ ] All layouts accessible
   - [ ] 10 full cycles through all layouts
   - [ ] State persists correctly

### For Long-term Stability

- [ ] Extended soak test: 8 hours of random operations
- [ ] Memory profile: Stable after 1000+ enable/disable cycles
- [ ] No GNOME Shell crashes during testing

---

## Implementation Timeline

| Phase | Work Items | Estimated Time |
|-------|------------|----------------|
| 1 | ResourceTracker utility | 4 hours |
| 2 | D-Bus interface | 4 hours |
| 3 | Integration into extension.js | 2 hours |
| 4 | Integration into UI components | 4 hours |
| 5 | Test scripts | 4 hours |
| 6 | Makefile updates | 1 hour |
| 7 | Testing and refinement | 4 hours |

**Total:** ~23 hours (3-4 days)

---

## Future Enhancements

- **Automated memory profiling** - Integrate with heaptrack or similar
- **Crash recovery testing** - Simulate GNOME Shell restarts
- **Regression test framework** - Extend D-Bus interface for functional tests
- **Performance benchmarks** - Track UI responsiveness metrics
- **CI with nested virtualization** - GitHub Actions with GNOME VM (complex)

---

## References

- [GNOME Shell Extension Development](https://gjs.guide/extensions/)
- [GJS D-Bus Guide](https://gjs.guide/guides/gio/dbus.html)
- [GSettings Schema Specification](https://docs.gtk.org/gio/class.Settings.html)
- [Mutter Signal Handling](https://gitlab.gnome.org/GNOME/mutter)
