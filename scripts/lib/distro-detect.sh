#!/bin/bash
#
# distro-detect.sh - Distro detection utilities for VM setup scripts
#
# Provides functions to detect Linux distribution on both host and guest systems.
# Used by vm-setup and vm-network-setup scripts to adapt commands per distro.
#

# Detect distribution on local machine
# Returns: fedora, ubuntu, arch, or unknown
detect_host_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            fedora)
                echo "fedora"
                ;;
            ubuntu)
                echo "ubuntu"
                ;;
            arch|manjaro|endeavouros)
                echo "arch"
                ;;
            debian)
                echo "debian"
                ;;
            *)
                echo "unknown"
                ;;
        esac
    else
        echo "unknown"
    fi
}

# Detect distribution on remote machine via SSH
# Usage: detect_guest_distro user@host
# Returns: fedora, ubuntu, arch, or unknown
detect_guest_distro() {
    local ssh_target="$1"
    
    if [ -z "$ssh_target" ]; then
        echo "unknown"
        return
    fi
    
    local distro=$(ssh "$ssh_target" "if [ -f /etc/os-release ]; then . /etc/os-release; echo \$ID; else echo unknown; fi" 2>/dev/null)
    
    case "$distro" in
        fedora)
            echo "fedora"
            ;;
        ubuntu)
            echo "ubuntu"
            ;;
        arch|manjaro|endeavouros)
            echo "arch"
            ;;
        debian)
            echo "debian"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Get package manager command for a distro
# Usage: get_package_manager fedora
# Returns: dnf, apt, pacman, or unknown
get_package_manager() {
    local distro="$1"
    
    case "$distro" in
        fedora)
            echo "dnf"
            ;;
        ubuntu|debian)
            echo "apt"
            ;;
        arch)
            echo "pacman"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Get firewall management tool for a distro
# Usage: get_firewall_tool fedora
# Returns: firewalld, ufw, iptables, or unknown
get_firewall_tool() {
    local distro="$1"
    
    case "$distro" in
        fedora)
            echo "firewalld"
            ;;
        ubuntu|debian)
            # Ubuntu typically uses ufw, but we'll use direct iptables-persistent
            echo "ufw"
            ;;
        arch)
            echo "iptables"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Get install command for a package
# Usage: get_install_command fedora "package1 package2"
# Returns: Full install command string
get_install_command() {
    local distro="$1"
    local packages="$2"
    
    case "$distro" in
        fedora)
            echo "sudo dnf install -y $packages"
            ;;
        ubuntu|debian)
            echo "sudo apt-get update && sudo apt-get install -y $packages"
            ;;
        arch)
            echo "sudo pacman -S --noconfirm $packages"
            ;;
        *)
            echo "# Unknown distro: $distro"
            ;;
    esac
}

# Get distro version
# Usage: get_distro_version fedora
# Returns: version string (e.g., "43", "24.04")
get_distro_version() {
    local distro="$1"
    
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$VERSION_ID"
    else
        echo "unknown"
    fi
}

# Get pretty distro name
# Usage: get_distro_pretty_name fedora
# Returns: Human-readable name (e.g., "Fedora Linux 43")
get_distro_pretty_name() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$PRETTY_NAME"
    else
        echo "Unknown Linux"
    fi
}
