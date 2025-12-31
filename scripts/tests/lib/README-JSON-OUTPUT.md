# JSON-Based Test Output System

## Overview

The test infrastructure uses a JSON-based output system that separates data generation from presentation. This eliminates fragile text parsing and enables flexible formatting.

## Architecture

```
Test Execution → Text Output (human-readable, live feedback)
              ↓
              JSON Output (structured data)
              ↓
              Formatter (generates display from JSON)
```

## Components

### 1. JSON Converters

**`mem-output-to-json.py`** - Converts memory test text output to JSON
- Input: Memory test text output
- Output: Structured JSON with test results and statistics
- Usage: `./mem-output-to-json.py <input.txt> <output.json>`

**`func-output-to-json.py`** - Converts functional test text output to JSON  
- Input: Functional test text output
- Output: Structured JSON with test results and summary
- Usage: `./func-output-to-json.py <input.txt> <output.json>`

### 2. JSON Formatter

**`format-release-summary-json.sh`** - Generates formatted summary from JSON
- Input: Memory JSON + Functional JSON
- Output: Formatted console output with colors
- Usage: `./format-release-summary-json.sh <mem.json> <func.json> <suite-name>`
- Benefits: Simple (~150 lines vs 300+ lines of text parsing)

### 3. Integrated Test Scripts

**`test-func-runner.sh`** - Now generates JSON directly
- Set `JSON_OUTPUT=/path/to/output.json` to enable
- Generates structured JSON after all tests complete

**`run-tests`** - Uses JSON-based system for release suites
- Converts memory test text → JSON
- Uses functional test JSON output
- Formats summary from JSON files

## JSON Schemas

### Memory Test JSON

```json
{
  "schema_version": "1.0",
  "timestamp": "2025-12-30T18:35:00Z",
  "preset": "test",
  "tests": [
    {
      "name": "Enable/Disable",
      "runs": 3,
      "variable_duration": true,
      "duration_values": [1, 2, 3],
      "results": [
        {
          "run": 1,
          "duration_min": 1,
          "start_mem_mb": 390.0,
          "final_mem_mb": 452.4,
          "init_cost_mb": 18.1,
          "cycles": 195
        }
      ],
      "statistics": {
        "avg_init_cost_mb": 16.4,
        "final_range_mb": 0.3,
        "r_squared": 0.972,
        "status": "PASS"
      }
    }
  ]
}
```

### Functional Test JSON

```json
{
  "schema_version": "1.0",
  "timestamp": "2025-12-30T18:45:00Z",
  "tests": [
    {
      "name": "layout-switching",
      "status": "PASS",
      "memory_leak": false,
      "errors": []
    },
    {
      "name": "edge-cases",
      "status": "FAIL",
      "memory_leak": true,
      "errors": ["Memory leak detected"]
    }
  ],
  "summary": {
    "total": 7,
    "passed": 4,
    "failed": 3,
    "memory_leaks": 1
  }
}
```

## Benefits

1. **No Fragile Parsing** - JSON is self-describing and standard
2. **Infinite Reformatting** - Format same data multiple ways without re-running tests
3. **Fast Iteration** - Test formatters with static JSON (no 25-min waits)
4. **Easy Debugging** - Inspect JSON files directly
5. **Future Extensions** - Add new output formats (HTML, markdown, etc.) easily

## Usage Examples

### Reformat Existing Test Results

```bash
# After running tests with --no-cleanup
./scripts/tests/lib/mem-output-to-json.py /tmp/mem-output.txt /tmp/mem.json
./scripts/tests/lib/func-output-to-json.py /tmp/func-output.txt /tmp/func.json

# Format in different ways
./scripts/tests/lib/format-release-summary-json.sh /tmp/mem.json /tmp/func.json release-test
```

### Test Formatter Development

```bash
# Use sample data for instant feedback
./scripts/tests/lib/format-release-summary-json.sh \
    scripts/tests/test-data/sample-mem-output.json \
    scripts/tests/test-data/sample-func-output.json \
    release-test
```

### Run Tests with JSON Output

```bash
# Functional tests
JSON_OUTPUT=/tmp/func-results.json ./scripts/tests/test-func-runner.sh --all

# Release suite (automatic)
./scripts/run-tests release-test --local
```

## Migration Notes

- Old text-parsing formatter (`format-release-summary.sh`) - **REMOVED**
- Old shell-based JSON converter (`mem-output-to-json.sh`) - **REMOVED**
- Memory tests still output text (not modified) - converted to JSON for formatting
- Functional tests generate JSON directly (dual output: text + JSON)
