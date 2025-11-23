# Profile System API Reference

Complete specification for the Zoned profile system.

## Profile Structure

### Profile Object

A profile defines a window layout with multiple zones.

```typescript
interface Profile {
    id: string;           // Unique identifier (alphanumeric + underscores)
    name: string;         // Display name
    zones: Zone[];        // Array of zone definitions (min: 1)
}
```

**Example:**
```json
{
    "id": "halves",
    "name": "Halves",
    "zones": [
        {"name": "Left Half", "x": 0, "y": 0, "w": 0.5, "h": 1},
        {"name": "Right Half", "x": 0.5, "y": 0, "w": 0.5, "h": 1}
    ]
}
```

### Zone Object

A zone defines a rectangular region on the screen using percentages.

```typescript
interface Zone {
    name: string;    // Display name for this zone
    x: number;       // X position (0.0 - 1.0, where 0 = left edge)
    y: number;       // Y position (0.0 - 1.0, where 0 = top edge)
    w: number;       // Width (0.0 - 1.0, where 1.0 = full screen width)
    h: number;       // Height (0.0 - 1.0, where 1.0 = full screen height)
}
```

**Coordinate System:**
```
(0,0) ──────────────────→ x (1.0)
  │
  │    ┌────────────────┐
  │    │                │
  │    │  Screen Area   │
  │    │                │
  │    └────────────────┘
  ↓
  y
(1.0)
```

**Examples:**

Left half:
```json
{"name": "Left Half", "x": 0, "y": 0, "w": 0.5, "h": 1}
```

Top-right quarter:
```json
{"name": "Top-Right", "x": 0.5, "y": 0, "w": 0.5, "h": 0.5}
```

Center 60%:
```json
{"name": "Center", "x": 0.2, "y": 0, "w": 0.6, "h": 1}
```

## Validation Rules

### Profile Validation

1. **Required Fields:**
   - `id` must be present and non-empty
   - `name` must be present and non-empty
   - `zones` must be present and be an array

2. **ID Format:**
   - Alphanumeric characters and underscores only
   - Recommended: lowercase with underscores (e.g., `main_left`, `thirds`)
   - No spaces or special characters

3. **Zones Array:**
   - Must contain at least 1 zone
   - Maximum 10 zones recommended (UI constraints)

### Zone Validation

1. **Required Fields:**
   - All fields must be present: `name`, `x`, `y`, `w`, `h`

2. **Value Ranges:**
   - `x`: 0.0 ≤ x < 1.0
   - `y`: 0.0 ≤ y < 1.0
   - `w`: 0.0 < w ≤ 1.0
   - `h`: 0.0 < h ≤ 1.0

3. **Logical Constraints:**
   - `x + w` should ≤ 1.0 (not exceed screen width)
   - `y + h` should ≤ 1.0 (not exceed screen height)
   - Zones can overlap (not enforced, but generally avoided)

4. **Name Field:**
   - Must be non-empty string
   - Should be descriptive (e.g., "Left Half", "Main Area")

## Default Profiles

Zoned ships with 9 default profiles covering common layouts.

### 1. Center Focus (60%)
**ID:** `center_focus`

Emphasizes center area with narrow side panels.

```
┌──┬────────────┬──┐
│  │            │  │
│20│    60%     │20│
│% │            │% │
└──┴────────────┴──┘
```

```json
{
    "id": "center_focus",
    "name": "Center (60%)",
    "zones": [
        {"name": "Left (20%)", "x": 0, "y": 0, "w": 0.2, "h": 1},
        {"name": "Center (60%)", "x": 0.2, "y": 0, "w": 0.6, "h": 1},
        {"name": "Right (20%)", "x": 0.8, "y": 0, "w": 0.2, "h": 1}
    ]
}
```

### 2. Balanced Focus (50%)
**ID:** `balanced_focus`

Even center with equal side panels.

```
┌───┬──────────┬───┐
│   │          │   │
│25 │   50%    │25 │
│%  │          │%  │
└───┴──────────┴───┘
```

### 3. Thirds
**ID:** `thirds`

Three equal columns.

```
┌────┬────┬────┐
│    │    │    │
│33% │33% │33% │
│    │    │    │
└────┴────┴────┘
```

### 4. Halves
**ID:** `halves`

Two equal columns (most common).

```
┌──────┬──────┐
│      │      │
│ 50%  │ 50%  │
│      │      │
└──────┴──────┘
```

### 5. Quarters
**ID:** `quarters`

Four equal quadrants (2D layout).

```
┌──────┬──────┐
│      │      │
│ 50%  │ 50%  │
├──────┼──────┤
│      │      │
│ 50%  │ 50%  │
└──────┴──────┘
```

### 6. Main Left (67/33)
**ID:** `main_side_left`

Large left panel with narrower right side.

```
┌─────────┬────┐
│         │    │
│   67%   │33% │
│         │    │
└─────────┴────┘
```

### 7. Main Right (67/33)
**ID:** `main_side_right`

Large right panel with narrower left side.

```
┌────┬─────────┐
│    │         │
│33% │   67%   │
│    │         │
└────┴─────────┘
```

### 8. Balanced Left (40/40/20)
**ID:** `balanced_left`

Two equal panels on left, narrow right.

```
┌─────┬─────┬──┐
│     │     │  │
│ 40% │ 40% │20│
│     │     │% │
└─────┴─────┴──┘
```

### 9. Balanced Right (20/40/40)
**ID:** `balanced_right`

Narrow left, two equal panels on right.

```
┌──┬─────┬─────┐
│  │     │     │
│20│ 40% │ 40% │
│% │     │     │
└──┴─────┴─────┘
```

## Profile Management API

### ProfileManager Methods

#### `loadProfiles(): void`
Load and merge default and user profiles.

```javascript
profileManager.loadProfiles();
```

**Process:**
1. Load default profiles from `extension/config/default-profiles.json`
2. Load user profiles from `~/.config/zoned/profiles.json` (if exists)
3. Merge by `id` (user overrides default)
4. Validate all profiles
5. Restore last used profile from GSettings

**Throws:** `Error` if profile validation fails

#### `getCurrentProfile(): Profile`
Get the currently active profile.

```javascript
const profile = profileManager.getCurrentProfile();
console.log(profile.name);  // "Halves"
```

**Returns:** Profile object

**Fallback:** Returns first profile if current profile ID not found

#### `getCurrentZone(): Zone`
Get the currently active zone within the current profile.

```javascript
const zone = profileManager.getCurrentZone();
console.log(zone.name);  // "Left Half"
```

**Returns:** Zone object

**Throws:** `Error` if zone index out of bounds

#### `setProfile(profileId: string): void`
Switch to a different profile.

```javascript
profileManager.setProfile('thirds');
```

**Parameters:**
- `profileId`: ID of profile to activate

**Effects:**
- Sets current profile
- Resets zone index to 0 (first zone)
- Saves state to GSettings

**Throws:** `Error` if profile ID not found

#### `cycleZone(direction: number): Zone`
Move to next or previous zone in current profile.

```javascript
// Next zone
const nextZone = profileManager.cycleZone(+1);

// Previous zone  
const prevZone = profileManager.cycleZone(-1);
```

**Parameters:**
- `direction`: +1 for next, -1 for previous

**Returns:** The new current zone

**Behavior:**
- Wraps around: after last zone → first zone
- Wraps around: before first zone → last zone
- Saves new index to GSettings

## State Persistence

### GSettings Keys

**current-profile-id** (string)
- Current active profile ID
- Default: `"halves"`
- Example: `"thirds"`, `"main_side_left"`

**current-zone-index** (integer)
- Current zone index within profile
- Default: `1` (first zone, 1-based in GSettings, 0-based in code)
- Range: 0 to (number of zones - 1)

### State Management

**Save State:**
```javascript
// Automatically saved by ProfileManager on:
// - setProfile()
// - cycleZone()

// Manual save:
profileManager._saveState();
```

**Restore State:**
```javascript
// Automatically restored on:
// - loadProfiles()

// Manual restore:
profileManager._restoreState();
```

## Custom Profiles

Users can create custom profiles by creating:
`~/.config/zoned/profiles.json`

### Creating Custom Profiles

```json
{
    "profiles": [
        {
            "id": "my_custom_layout",
            "name": "My Custom Layout",
            "zones": [
                {"name": "Zone 1", "x": 0, "y": 0, "w": 0.3, "h": 1},
                {"name": "Zone 2", "x": 0.3, "y": 0, "w": 0.4, "h": 1},
                {"name": "Zone 3", "x": 0.7, "y": 0, "w": 0.3, "h": 1}
            ]
        }
    ]
}
```

### Overriding Default Profiles

To override a default profile, use the same `id`:

```json
{
    "profiles": [
        {
            "id": "halves",
            "name": "My Custom Halves",
            "zones": [
                {"name": "Left 45%", "x": 0, "y": 0, "w": 0.45, "h": 1},
                {"name": "Right 55%", "x": 0.45, "y": 0, "w": 0.55, "h": 1}
            ]
        }
    ]
}
```

**Note:** User profiles completely replace default profiles with matching IDs.

## Advanced Layouts

### 2D Layouts (Quarters)

For layouts with both rows and columns:

```json
{
    "id": "custom_quarters",
    "name": "Custom Quarters",
    "zones": [
        {"name": "Top-Left", "x": 0, "y": 0, "w": 0.5, "h": 0.5},
        {"name": "Top-Right", "x": 0.5, "y": 0, "w": 0.5, "h": 0.5},
        {"name": "Bottom-Left", "x": 0, "y": 0.5, "w": 0.5, "h": 0.5},
        {"name": "Bottom-Right", "x": 0.5, "y": 0.5, "w": 0.5, "h": 0.5}
    ]
}
```

**Zone cycling order:** Top-left → Top-right → Bottom-left → Bottom-right

### Non-Uniform Layouts

Zones don't need to be uniform:

```json
{
    "id": "large_left_small_right",
    "name": "Large Left, Small Right",
    "zones": [
        {"name": "Large", "x": 0, "y": 0, "w": 0.8, "h": 1},
        {"name": "Top-Right", "x": 0.8, "y": 0, "w": 0.2, "h": 0.5},
        {"name": "Bottom-Right", "x": 0.8, "y": 0.5, "w": 0.2, "h": 0.5}
    ]
}
```

## Best Practices

1. **Profile IDs:**
   - Use lowercase with underscores
   - Be descriptive but concise
   - Avoid generic names like "layout1"

2. **Zone Names:**
   - Include percentage or position
   - Keep names short for UI display
   - Examples: "Main (67%)", "Right Side", "Top-Left"

3. **Zone Counts:**
   - 2-4 zones: Most practical
   - 5-6 zones: Advanced users
   - 7+ zones: May be cumbersome to cycle through

4. **Layout Design:**
   - Consider typical window aspect ratios
   - Avoid very narrow zones (< 20% width)
   - Avoid very short zones (< 30% height)
   - Test on different monitor sizes

5. **Testing:**
   - Validate JSON syntax
   - Test zone cycling order
   - Verify visual representation in picker
   - Test on multiple monitors

---
*Last Updated: 2025-11-21*
