## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

<!-- Mark the relevant option with an 'x' -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Code refactoring (no functional changes)
- [ ] Performance improvement
- [ ] Test coverage improvement

## Related Issues

<!-- Link to related issues using #issue_number -->

Fixes #
Relates to #

## Changes Made

<!-- List the specific changes made in this PR -->

- 
- 
- 

## Testing

<!-- Describe the testing you've done -->

- [ ] Tested on GNOME Shell version(s): 
- [ ] Tested on Wayland / X11 (specify):
- [ ] Ran `make lint-strict` (no errors)
- [ ] Ran VM functional tests `make vm-test-func` (if applicable)
- [ ] Ran VM memory tests `make vm-test-mem` (if applicable)
- [ ] Manual testing performed (describe below)

### Manual Testing Details

<!-- Describe your manual testing steps and results -->

## Screenshots/Videos

<!-- If applicable, add screenshots or videos to demonstrate the changes -->

## Checklist

<!-- Mark completed items with an 'x' -->

- [ ] My code follows the project's coding standards
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Memory Management

<!-- For code changes only -->

- [ ] All signal connections are properly disconnected in cleanup
- [ ] All GLib sources (timeouts, idles) are properly removed
- [ ] All created actors/widgets are properly destroyed
- [ ] No arrow functions capturing `this` in signal handlers (used `.bind()` instead)
- [ ] Verified no memory leaks with manual testing

## Additional Notes

<!-- Any additional information that reviewers should know -->
