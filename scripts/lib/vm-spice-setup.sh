#!/bin/bash
#
# vm-spice-setup.sh - Setup SPICE WebDAV sharing in guest VM
# Created by Cline
#
# This library handles the guest-side setup for SPICE WebDAV file sharing.
#

# Source common functions if not already loaded
[[ -z "$VIRSH_CONNECT" ]] && source "$(dirname "${BASH_SOURCE[0]}")/vm-detect.sh"

# ============================================
#  SPICE WEBDAV GUEST SETUP
# ============================================

# Setup SPICE WebDAV in the guest VM
# Args: $1 = domain (optional, uses VM_DOMAIN if not provided)
# Returns: 0 = success, 1 = failed, 2 = needs reboot
vm_spice_setup() {
    local domain="${1:-$VM_DOMAIN}"
    
    vm_print_step "Setting up SPICE WebDAV sharing..."
    
    # Check/install SPICE packages
    if ! vm_spice_check_packages "$domain"; then
        vm_print_step "Installing SPICE packages..."
        if ! vm_spice_install_packages "$domain"; then
            return 1
        fi
        # Packages just installed - need reboot
        vm_print_warning "SPICE packages installed - VM reboot required"
        echo ""
        echo "Please reboot the VM, then run 'make vm-setup' again."
        return 2
    fi
    
    vm_print_success "SPICE packages installed"
    
    # Check if share is mounted
    local mount_path
    mount_path=$(vm_spice_find_mount "$domain")
    
    if [[ -n "$mount_path" ]]; then
        vm_print_success "SPICE share mounted at: $mount_path"
        VM_MOUNT_PATH="$mount_path"
        VM_SHARE_TYPE="spice"
        return 0
    fi
    
    # Share not mounted - provide instructions
    vm_print_warning "SPICE share not mounted"
    echo ""
    echo "The SPICE shared folder needs to be configured and mounted."
    echo ""
    echo -e "${CYAN}Host side (GNOME Boxes):${NC}"
    echo "  1. Right-click VM → Properties → Devices & Shares"
    echo "  2. Click '+' under 'Shared Folders'"
    echo "  3. Select this project folder: $(pwd)"
    echo "  4. Name it: zoned"
    echo ""
    echo -e "${CYAN}Guest side (in VM):${NC}"
    echo "  1. Open the file manager (Nautilus)"
    echo "  2. Click 'Other Locations' in the sidebar"
    echo "  3. Under 'Networks', click 'Spice client folder'"
    echo ""
    echo "After mounting, run 'make vm-setup' again."
    
    return 1
}

# Check if SPICE packages are installed
vm_spice_check_packages() {
    local domain="$1"
    
    # Check for spice-webdavd
    if ssh "$domain" "command -v /usr/sbin/spice-webdavd || command -v spice-webdavd" &>/dev/null; then
        return 0
    fi
    return 1
}

# Install SPICE packages based on distro
vm_spice_install_packages() {
    local domain="$1"
    
    # Detect distro
    local distro
    distro=$(ssh "$domain" ". /etc/os-release 2>/dev/null; echo \$ID" || echo "unknown")
    
    vm_print_info "Detected distro: $distro"
    
    case "$distro" in
        ubuntu|debian|pop)
            vm_print_step "Installing SPICE packages (Ubuntu/Debian)..."
            ssh -t "$domain" "sudo apt update && sudo apt install -y spice-vdagent spice-webdavd gvfs-backends"
            ;;
        fedora)
            vm_print_step "Installing SPICE packages (Fedora)..."
            ssh -t "$domain" "sudo dnf install -y spice-vdagent spice-webdavd"
            ;;
        arch|endeavouros|manjaro)
            vm_print_step "Installing SPICE packages (Arch)..."
            ssh -t "$domain" "sudo pacman -S --noconfirm spice-vdagent phodav"
            ;;
        *)
            vm_print_warning "Unknown distro: $distro"
            echo "Please install spice-vdagent and spice-webdavd manually."
            return 1
            ;;
    esac
    
    # Enable user services
    ssh "$domain" "systemctl --user enable spice-webdavd 2>/dev/null; systemctl --user start spice-webdavd 2>/dev/null" || true
    
    vm_print_success "SPICE packages installed"
    return 0
}

# Find the SPICE WebDAV mount path
vm_spice_find_mount() {
    local domain="$1"
    
    # Try GVFS mount locations
    local gvfs_base
    gvfs_base=$(ssh "$domain" "find /run/user/1000/gvfs -maxdepth 1 -name 'dav*:*' -type d 2>/dev/null | head -n1" 2>/dev/null || echo "")
    
    if [[ -n "$gvfs_base" ]]; then
        # Check for zoned subdirectory
        if ssh "$domain" "test -f '$gvfs_base/zoned/extension/metadata.json'" 2>/dev/null; then
            echo "$gvfs_base/zoned"
            return 0
        fi
        # Check root of share
        if ssh "$domain" "test -f '$gvfs_base/extension/metadata.json'" 2>/dev/null; then
            echo "$gvfs_base"
            return 0
        fi
    fi
    
    # Try legacy mount path
    local legacy_path="/run/user/1000/spice-client-folder"
    if ssh "$domain" "test -f '$legacy_path/zoned/extension/metadata.json'" 2>/dev/null; then
        echo "$legacy_path/zoned"
        return 0
    fi
    if ssh "$domain" "test -f '$legacy_path/extension/metadata.json'" 2>/dev/null; then
        echo "$legacy_path"
        return 0
    fi
    
    return 1
}

# Check if SPICE is already mounted and working
vm_spice_check() {
    local domain="${1:-$VM_DOMAIN}"
    
    local mount_path
    mount_path=$(vm_spice_find_mount "$domain")
    
    if [[ -n "$mount_path" ]]; then
        VM_MOUNT_PATH="$mount_path"
        VM_SHARE_TYPE="spice"
        return 0
    fi
    return 1
}
