#!/bin/bash
#
# vm-virtiofs-setup.sh - Setup virtiofs sharing in guest VM
# Created by Cline
#
# This library handles the guest-side setup for virtiofs file sharing.
# It assumes vm-virtiofs-migrate has already configured the host side.
#

# Source common functions if not already loaded
[[ -z "$VIRSH_CONNECT" ]] && source "$(dirname "${BASH_SOURCE[0]}")/vm-detect.sh"

# ============================================
#  VIRTIOFS GUEST SETUP
# ============================================

# Setup virtiofs mount in the guest VM
# Args: $1 = domain (optional, uses VM_DOMAIN if not provided)
# Returns: 0 = success, 1 = failed, 2 = needs restart
vm_virtiofs_setup() {
    local domain="${1:-$VM_DOMAIN}"
    local virtiofs_tag="zoned"
    local mount_point="/mnt/$virtiofs_tag"
    
    vm_print_step "Setting up virtiofs sharing..."
    
    # Set results directory permissions on HOST (before VM mounts it)
    # virtiofs passthrough means VM cannot modify permissions
    local share_path
    share_path=$(virsh --connect "$VIRSH_CONNECT" dumpxml "$domain" 2>/dev/null | grep -A1 'filesystem.*virtiofs' | grep 'source dir' | sed "s/.*dir='\([^']*\)'.*/\1/")
    if [ -n "$share_path" ] && [ -d "$share_path/results" ]; then
        vm_print_step "Setting results/ permissions on host..."
        chmod 777 "$share_path/results" 2>/dev/null && vm_print_success "Results directory writable (777)" || vm_print_warning "Could not set permissions"
    fi
    
    # Check if virtiofs filesystem support exists
    if ! ssh "$domain" "grep -q virtiofs /proc/filesystems" 2>/dev/null; then
        vm_print_warning "virtiofs not in /proc/filesystems, trying to load module..."
        
        # Try to load the virtiofs module
        if ssh "$domain" "sudo modprobe virtiofs 2>/dev/null" 2>/dev/null; then
            # Check again after loading module
            if ssh "$domain" "grep -q virtiofs /proc/filesystems" 2>/dev/null; then
                vm_print_success "virtiofs module loaded successfully"
            else
                vm_print_error "virtiofs module loaded but not available in /proc/filesystems"
                echo ""
                vm_virtiofs_diagnose "$domain"
                return 1
            fi
        else
            vm_print_error "virtiofs filesystem not available in VM"
            echo ""
            vm_virtiofs_diagnose "$domain"
            return 1
        fi
    fi
    
    # Check if already mounted
    if ssh "$domain" "mountpoint -q $mount_point" 2>/dev/null; then
        vm_print_success "virtiofs already mounted at $mount_point"
        VM_MOUNT_PATH="$mount_point"
        VM_SHARE_TYPE="virtiofs"
        return 0
    fi
    
    # Check if we have a TTY for sudo password prompt
    if ! tty -s 2>/dev/null; then
        vm_print_warning "No terminal available for sudo password prompt"
        echo ""
        echo "Run the setup directly from a terminal:"
        echo "  ./scripts/vm-setup"
        echo ""
        echo "Or run these commands manually in the VM:"
        echo "  ssh $domain"
        echo "  sudo mkdir -p $mount_point"
        echo "  sudo mount -t virtiofs $virtiofs_tag $mount_point"
        echo "  exit"
        echo ""
        echo "Then run 'make vm-setup' again."
        return 1
    fi
    
    # Do mkdir + mount in a single SSH command to minimize password prompts
    vm_print_step "Creating mount point and mounting..."
    echo ""
    echo -e "${YELLOW}You will be prompted for your VM user password (for sudo):${NC}"
    echo -e "${CYAN}(Type your password and press Enter - you won't see it as you type)${NC}"
    echo ""
    
    local setup_output
    setup_output=$(ssh -t "$domain" "
        sudo mkdir -p $mount_point 2>&1
        sudo mount -t virtiofs $virtiofs_tag $mount_point 2>&1
        if mountpoint -q $mount_point; then
            echo 'MOUNT_SUCCESS'
        else
            echo 'MOUNT_FAILED'
        fi
    ") || true
    
    if [[ "$setup_output" == *"MOUNT_SUCCESS"* ]]; then
        vm_print_success "virtiofs share mounted at $mount_point"
        
        # Add fstab entry for persistence (non-fatal if it fails)
        vm_virtiofs_add_fstab "$domain" "$virtiofs_tag" "$mount_point" || true
        
        VM_MOUNT_PATH="$mount_point"
        VM_SHARE_TYPE="virtiofs"
        return 0
    fi
    
    # Mount failed - check if it's a "share not configured" error
    if [[ "$setup_output" == *"No such device"* ]] || [[ "$setup_output" == *"bad superblock"* ]] || [[ "$setup_output" == *"wrong fs type"* ]] || [[ "$setup_output" == *"MOUNT_FAILED"* ]]; then
        vm_print_warning "virtiofs share not available"
        echo ""
        echo "The virtiofs share '$virtiofs_tag' is not exposed to the VM."
        echo ""
        
        # Check if vm-virtiofs-migrate was run (check host-side XML)
        local has_virtiofs
        has_virtiofs=$(virsh --connect "$VIRSH_CONNECT" dumpxml "$domain" 2>/dev/null | grep -c "virtiofs")
        
        if [[ "$has_virtiofs" -gt 0 ]]; then
            echo "The host-side virtiofs is configured but the VM needs to be restarted."
            echo ""
            read -p "Restart VM now to apply configuration? [Y/n]: " restart_confirm
            if [[ "${restart_confirm,,}" != "n" ]]; then
                if vm_virtiofs_restart_and_mount "$domain" "$virtiofs_tag" "$mount_point"; then
                    return 0
                fi
            fi
            return 2  # Needs restart
        else
            echo "Host-side virtiofs is NOT configured."
            echo "Run 'scripts/vm-virtiofs-migrate' first to configure virtiofs."
            return 1
        fi
    fi
    
    # Some other error
    vm_print_error "Failed to mount virtiofs"
    echo "Output: $setup_output"
    return 1
}

# Add fstab entry for persistent mount
vm_virtiofs_add_fstab() {
    local domain="$1"
    local tag="$2"
    local mount_point="$3"
    
    if ssh "$domain" "grep -q '^$tag[[:space:]]' /etc/fstab" 2>/dev/null; then
        vm_print_info "fstab entry already exists"
        return 0
    fi
    
    vm_print_step "Adding fstab entry for persistent mount..."
    # Need -t option to allocate pseudo-terminal for sudo with tee
    if ssh -t "$domain" "echo '$tag $mount_point virtiofs defaults,nofail 0 0' | sudo tee -a /etc/fstab >/dev/null" 2>/dev/null; then
        vm_print_success "fstab entry added"
        return 0
    else
        vm_print_warning "Could not add fstab entry (mount will not persist across reboots)"
        return 1
    fi
}

# Restart VM and retry mount
vm_virtiofs_restart_and_mount() {
    local domain="$1"
    local virtiofs_tag="$2"
    local mount_point="$3"
    
    vm_print_info "Restarting VM to apply virtiofs configuration..."
    echo ""
    
    # Graceful shutdown
    vm_print_step "Shutting down VM..."
    virsh --connect "$VIRSH_CONNECT" shutdown "$domain" 2>/dev/null || true
    
    # Wait for shutdown (max 60 seconds)
    local waited=0
    local state
    while [[ $waited -lt 60 ]]; do
        state=$(virsh --connect "$VIRSH_CONNECT" domstate "$domain" 2>/dev/null || echo "unknown")
        if [[ "$state" == "shut off" ]]; then
            vm_print_success "VM shut down"
            break
        fi
        echo -n "."
        sleep 2
        waited=$((waited + 2))
    done
    echo ""
    
    if [[ "$state" != "shut off" ]]; then
        vm_print_warning "Graceful shutdown timed out, forcing off..."
        virsh --connect "$VIRSH_CONNECT" destroy "$domain" 2>/dev/null || true
        sleep 2
    fi
    
    # Start VM
    vm_print_step "Starting VM..."
    virsh --connect "$VIRSH_CONNECT" start "$domain" 2>/dev/null
    
    # Wait for VM to be running
    waited=0
    while [[ $waited -lt 120 ]]; do
        state=$(virsh --connect "$VIRSH_CONNECT" domstate "$domain" 2>/dev/null || echo "unknown")
        if [[ "$state" == "running" ]]; then
            vm_print_success "VM is running"
            break
        fi
        echo -n "."
        sleep 2
        waited=$((waited + 2))
    done
    echo ""
    
    if [[ "$state" != "running" ]]; then
        vm_print_error "VM failed to start"
        return 1
    fi
    
    # Wait for SSH
    vm_print_step "Waiting for SSH..."
    waited=0
    while [[ $waited -lt 60 ]]; do
        if ssh -o ConnectTimeout=3 -o BatchMode=yes "$domain" "exit" 2>/dev/null; then
            vm_print_success "SSH connection restored"
            break
        fi
        echo -n "."
        sleep 3
        waited=$((waited + 3))
    done
    echo ""
    
    if ! ssh -o ConnectTimeout=3 -o BatchMode=yes "$domain" "exit" 2>/dev/null; then
        vm_print_error "SSH connection timed out"
        return 1
    fi
    
    # Retry mount
    vm_print_step "Retrying virtiofs mount..."
    ssh "$domain" "sudo mkdir -p $mount_point" 2>/dev/null
    
    if ssh "$domain" "sudo mount -t virtiofs $virtiofs_tag $mount_point" 2>/dev/null; then
        vm_print_success "virtiofs share mounted at $mount_point"
        
        # Add fstab entry
        vm_virtiofs_add_fstab "$domain" "$virtiofs_tag" "$mount_point"
        
        VM_MOUNT_PATH="$mount_point"
        VM_SHARE_TYPE="virtiofs"
        return 0
    else
        vm_print_error "virtiofs mount still failing after restart"
        echo ""
        echo "The share may not be configured correctly."
        echo "Run 'scripts/vm-virtiofs-migrate' to reconfigure."
        return 1
    fi
}

# Check if virtiofs is already mounted and working
vm_virtiofs_check() {
    local domain="${1:-$VM_DOMAIN}"
    local mount_point="/mnt/zoned"
    
    if ssh "$domain" "mountpoint -q $mount_point && test -f $mount_point/extension/metadata.json" 2>/dev/null; then
        VM_MOUNT_PATH="$mount_point"
        VM_SHARE_TYPE="virtiofs"
        return 0
    fi
    return 1
}

# Diagnose why virtiofs isn't available
vm_virtiofs_diagnose() {
    local domain="$1"
    
    echo "Diagnosing virtiofs availability..."
    echo ""
    
    # Check kernel version
    local kernel_version
    kernel_version=$(ssh "$domain" "uname -r" 2>/dev/null || echo "unknown")
    echo "  Kernel version: $kernel_version"
    
    local kernel_major kernel_minor
    kernel_major=$(echo "$kernel_version" | cut -d. -f1)
    kernel_minor=$(echo "$kernel_version" | cut -d. -f2)
    
    if [[ "$kernel_major" -lt 5 ]] || [[ "$kernel_major" -eq 5 && "$kernel_minor" -lt 4 ]]; then
        echo "  ⚠ virtiofs requires Linux kernel 5.4 or newer"
        echo "  Your kernel ($kernel_version) is too old"
        echo ""
        echo "Solutions:"
        echo "  1. Update your VM's kernel"
        echo "  2. Use SPICE file sharing instead (choose option 2 during setup)"
        return
    fi
    
    # Check if module exists
    local has_module
    has_module=$(ssh "$domain" "modinfo virtiofs >/dev/null 2>&1 && echo yes || echo no" 2>/dev/null || echo "no")
    echo "  virtiofs module available: $has_module"
    
    if [[ "$has_module" == "no" ]]; then
        echo ""
        echo "The virtiofs kernel module is not available."
        echo ""
        echo "Possible reasons:"
        echo "  1. Kernel built without virtiofs support (CONFIG_VIRTIO_FS not set)"
        echo "  2. Distribution doesn't include virtiofs module"
        echo ""
        echo "Solutions:"
        echo "  1. Install a newer kernel with virtiofs support"
        echo "  2. Use SPICE file sharing instead (choose option 2 during setup)"
        return
    fi
    
    # Check loaded modules
    local is_loaded
    is_loaded=$(ssh "$domain" "lsmod | grep -q virtiofs && echo yes || echo no" 2>/dev/null || echo "no")
    echo "  virtiofs module loaded: $is_loaded"
    
    echo ""
    echo "Kernel supports virtiofs but something isn't right."
    echo "Try manually loading the module in the VM:"
    echo "  ssh $domain"
    echo "  sudo modprobe virtiofs"
    echo "  grep virtiofs /proc/filesystems"
}
