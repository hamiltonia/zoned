# Test Data Directory

This directory contains sample test outputs for validating the release summary formatter.

## Purpose

The test output files stored here allow us to:
- Test parsing logic without running full test suites
- Validate summary formatting with known data
- Detect regressions in output parsing
- Document expected output formats

## Capturing Sample Data

To capture test outputs for use as sample data:

```bash
# Run release test with --no-cleanup flag
./scripts/run-tests release-test --no-cleanup --local

# The script will print paths to the temp files:
# Test outputs saved:
#   Memory:     /tmp/tmp.XXXXXX
#   Functional: /tmp/tmp.XXXXXX

# Copy them to this directory with descriptive names
cp /tmp/tmp.XXXXXX mem-output-3tests-pass.txt
cp /tmp/tmp.XXXXXX func-output-4pass-3fail.txt
```

## File Naming Convention

Use descriptive names that indicate the test state:

**Memory test outputs:**
- `mem-output-3tests-pass.txt` - All 3 tests passing
- `mem-output-warn.txt` - Tests with warnings
- `mem-output-fail.txt` - Tests failing

**Functional test outputs:**
- `func-output-all-pass.txt` - All tests passing
- `func-output-with-failures.txt` - Some tests failing
- `func-output-with-leaks.txt` - Tests with memory leaks detected

## Testing the Formatter

Once the helper script is created:

```bash
# Test formatter with sample data
./scripts/tests/lib/format-release-summary.sh \
    scripts/tests/test-data/mem-output-3tests-pass.txt \
    scripts/tests/test-data/func-output-with-failures.txt \
    release-test
```
