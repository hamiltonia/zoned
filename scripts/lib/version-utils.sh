#!/usr/bin/env bash
# Version utilities for Zoned extension
# Provides helper functions for version parsing, validation, and manipulation

set -euo pipefail

# Colors for output
readonly COLOR_RESET='\033[0m'
readonly COLOR_INFO='\033[36m'
readonly COLOR_SUCCESS='\033[32m'
readonly COLOR_ERROR='\033[31m'
readonly COLOR_WARN='\033[33m'

# Get the repo root directory
get_repo_root() {
    git rev-parse --show-toplevel
}

# Get current version from metadata.json
get_current_version() {
    local repo_root
    repo_root=$(get_repo_root)
    jq -r '."version-name"' "$repo_root/extension/metadata.json"
}

# Get current EGO version from metadata.json
get_current_ego_version() {
    local repo_root
    repo_root=$(get_repo_root)
    jq -r '.version' "$repo_root/extension/metadata.json"
}

# Parse semver into major.minor.patch
parse_semver() {
    local version=$1
    # Remove 'v' prefix if present
    version=${version#v}
    
    # Extract major.minor.patch
    if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]} ${BASH_REMATCH[3]}"
    else
        echo "ERROR: Invalid semver format: $version" >&2
        return 1
    fi
}

# Validate semver format
validate_semver() {
    local version=$1
    # Remove 'v' prefix if present
    version=${version#v}
    
    if [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0
    else
        return 1
    fi
}

# Validate EGO version (positive integer)
validate_ego_version() {
    local version=$1
    
    if [[ $version =~ ^[1-9][0-9]*$ ]]; then
        return 0
    else
        return 1
    fi
}

# Bump semver version
bump_version() {
    local current_version=$1
    local bump_type=$2  # major, minor, or patch
    
    # Parse current version
    read -r major minor patch <<< "$(parse_semver "$current_version")" || return 1
    
    # Bump appropriate component
    case $bump_type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            echo "ERROR: Invalid bump type: $bump_type (must be major, minor, or patch)" >&2
            return 1
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Update version in metadata.json
update_metadata_version() {
    local new_semver=$1
    local new_ego=$2
    local version_display=$3
    local repo_root
    repo_root=$(get_repo_root)
    local metadata_file="$repo_root/extension/metadata.json"
    
    # Create temporary file with updated versions
    jq \
        --arg semver "$new_semver" \
        --argjson ego "$new_ego" \
        --arg display "$version_display" \
        '.version = $ego | ."version-name" = $semver | ."version-display" = $display' \
        "$metadata_file" > "$metadata_file.tmp"
    
    mv "$metadata_file.tmp" "$metadata_file"
    echo -e "${COLOR_SUCCESS}✓ Updated metadata.json${COLOR_RESET}"
}

# Update version in CHANGELOG.md
update_changelog_version() {
    local new_version=$1
    local repo_root
    repo_root=$(get_repo_root)
    local changelog_file="$repo_root/CHANGELOG.md"
    
    # Check if [Unreleased] section exists
    if ! grep -q "^\[Unreleased\]" "$changelog_file"; then
        echo -e "${COLOR_WARN}⚠ No [Unreleased] section found in CHANGELOG.md${COLOR_RESET}"
        return 1
    fi
    
    # Get current date in YYYY-MM-DD format
    local current_date
    current_date=$(date +%Y-%m-%d)
    
    # Replace [Unreleased] with versioned entry and add new [Unreleased] section
    sed -i.bak \
        -e "s/^## \[Unreleased\]/## [Unreleased]\n\n## [$new_version] - $current_date/" \
        "$changelog_file"
    
    rm -f "$changelog_file.bak"
    echo -e "${COLOR_SUCCESS}✓ Updated CHANGELOG.md${COLOR_RESET}"
}

# Check if working directory is clean
check_git_clean() {
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${COLOR_ERROR}ERROR: Working directory has uncommitted changes${COLOR_RESET}" >&2
        echo -e "${COLOR_INFO}Please commit or stash changes before proceeding${COLOR_RESET}" >&2
        return 1
    fi
    return 0
}

# Check if on main branch
check_on_main() {
    local current_branch
    current_branch=$(git branch --show-current)
    
    if [[ $current_branch != "main" ]]; then
        echo -e "${COLOR_ERROR}ERROR: Not on main branch (current: $current_branch)${COLOR_RESET}" >&2
        return 1
    fi
    return 0
}

# Create release branch
create_release_branch() {
    local version=$1
    local branch_name="release/v$version"
    
    git checkout -b "$branch_name"
    echo -e "${COLOR_SUCCESS}✓ Created branch: $branch_name${COLOR_RESET}"
    echo "$branch_name"
}

# Commit version changes
commit_version_changes() {
    local version=$1
    
    git add extension/metadata.json CHANGELOG.md
    git commit -m "Bump version to $version"
    echo -e "${COLOR_SUCCESS}✓ Committed version changes${COLOR_RESET}"
}

# Push branch and create PR
push_and_create_pr() {
    local branch_name=$1
    local version=$2
    
    # Push branch
    git push -u origin "$branch_name"
    echo -e "${COLOR_SUCCESS}✓ Pushed branch to origin${COLOR_RESET}"
    
    # Create PR using GitHub CLI if available
    if command -v gh &> /dev/null; then
        gh pr create \
            --title "Release v$version" \
            --body "Version bump to v$version. Please review and merge to main." \
            --base main
        echo -e "${COLOR_SUCCESS}✓ Created pull request${COLOR_RESET}"
    else
        echo -e "${COLOR_WARN}⚠ GitHub CLI not found - create PR manually:${COLOR_RESET}"
        echo -e "${COLOR_INFO}  https://github.com/hamiltonia/zoned/compare/$branch_name?expand=1${COLOR_RESET}"
    fi
}

# Create and push git tag
create_and_push_tag() {
    local version=$1
    local commit=${2:-HEAD}
    
    # Create annotated tag
    git tag -a "v$version" "$commit" -m "Release v$version"
    echo -e "${COLOR_SUCCESS}✓ Created tag: v$version${COLOR_RESET}"
    
    # Push tag
    git push origin "v$version"
    echo -e "${COLOR_SUCCESS}✓ Pushed tag to origin${COLOR_RESET}"
}

# Check if tag already exists
check_tag_exists() {
    local version=$1
    
    if git rev-parse "v$version" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Get latest tag
get_latest_tag() {
    git describe --tags --abbrev=0 2>/dev/null || echo "none"
}
