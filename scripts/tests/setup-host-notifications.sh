#!/bin/bash
#
# setup-host-notifications.sh - Configure VM-to-host notifications
#
# This script sets up SSH access from the VM to the host machine
# so that notifications can be sent from VM tests to the host desktop.
#
# Run this script INSIDE THE VM after running 'make vm-install'
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "========================================"
echo "  VM-to-Host Notification Setup"
echo "========================================"
echo ""

# Check if we're in a VM
if ! command -v systemd-detect-virt &> /dev/null || ! systemd-detect-virt -q 2>/dev/null; then
    echo -e "${RED}Error: This script must be run INSIDE the VM${NC}"
    echo ""
    echo "To set up host notifications:"
    echo "  1. SSH into your VM"
    echo "  2. cd to the shared zoned directory"
    echo "  3. Run: ./scripts/vm-test/setup-host-notifications.sh"
    exit 1
fi

echo -e "${GREEN}✓${NC} Running in VM: $(systemd-detect-virt)"
echo ""

# Get gateway IP (host)
GATEWAY_IP=$(ip route | grep default | awk '{print $3}' | head -1)

if [ -z "$GATEWAY_IP" ]; then
    echo -e "${RED}Error: Could not detect gateway IP${NC}"
    exit 1
fi

echo -e "${CYAN}Host IP detected:${NC} $GATEWAY_IP"
echo ""

# Check if SSH server is running on host
echo "Checking if SSH server is accessible on host..."
if ssh -o BatchMode=yes -o ConnectTimeout=3 -o StrictHostKeyChecking=no "$GATEWAY_IP" "exit" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} SSH connection to host already working!"
    echo ""
    echo "Testing notification..."
    ssh -o BatchMode=yes -o ConnectTimeout=2 -o StrictHostKeyChecking=no "$GATEWAY_IP" \
        "DISPLAY=:0 notify-send -u normal -i dialog-information -a 'zoned-test (VM)' 'Setup Complete' 'VM can send notifications to host'" \
        2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Notification sent successfully!"
        echo ""
        echo "Setup complete. Test notifications will now appear on your host machine."
    else
        echo -e "${YELLOW}⚠${NC} SSH works but notification failed."
        echo "Make sure notify-send is installed on the host."
    fi
    exit 0
fi

echo -e "${YELLOW}⚠${NC} SSH connection to host not configured"
echo ""
echo "To enable VM-to-host notifications, you need to:"
echo ""
echo "1. ON THE HOST MACHINE, ensure SSH server is installed and running:"
echo "   ${CYAN}sudo systemctl enable --now sshd${NC}"
echo ""
echo "2. Generate SSH key IN THE VM (if you haven't already):"
echo "   ${CYAN}ssh-keygen -t ed25519 -N \"\" -f ~/.ssh/id_ed25519${NC}"
echo ""
echo "3. Copy the VM's SSH public key to the host:"
echo "   ${CYAN}ssh-copy-id $GATEWAY_IP${NC}"
echo "   (You'll need to enter your host password)"
echo ""
echo "Would you like to do this now?"
read -p "Continue? [y/N]: " confirm

if [[ "${confirm,,}" != "y" ]]; then
    echo "Setup cancelled."
    exit 1
fi

# Generate SSH key if needed
if [ ! -f ~/.ssh/id_ed25519 ]; then
    echo ""
    echo "Generating SSH key..."
    ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
    echo -e "${GREEN}✓${NC} SSH key generated"
fi

# Copy key to host
echo ""
echo "Copying SSH key to host $GATEWAY_IP..."
echo "You'll need to enter your HOST machine password:"
echo ""

if ssh-copy-id -o StrictHostKeyChecking=no "$GATEWAY_IP"; then
    echo ""
    echo -e "${GREEN}✓${NC} SSH key copied!"
    
    # Test the connection
    echo ""
    echo "Testing SSH connection..."
    if ssh -o BatchMode=yes -o ConnectTimeout=3 -o StrictHostKeyChecking=no "$GATEWAY_IP" "exit" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} SSH connection verified"
        
        # Test notification
        echo ""
        echo "Testing notification..."
        if ssh -o BatchMode=yes -o ConnectTimeout=2 -o StrictHostKeyChecking=no "$GATEWAY_IP" \
            "DISPLAY=:0 notify-send -u normal -i dialog-information -a 'zoned-test (VM)' 'Setup Complete' 'VM can now send notifications to host'" \
            2>/dev/null; then
            echo -e "${GREEN}✓${NC} Notification sent successfully!"
            echo ""
            echo "========================================"
            echo "  Setup Complete!"
            echo "========================================"
            echo ""
            echo "Test notifications will now appear on your host machine."
            echo "Run your tests and notifications will show up on the host desktop."
        else
            echo -e "${YELLOW}⚠${NC} SSH works but notification failed."
            echo "Make sure notify-send is installed on the host:"
            echo "  Ubuntu/Debian: sudo apt install libnotify-bin"
            echo "  Fedora: sudo dnf install libnotify"
        fi
    else
        echo -e "${RED}✗${NC} SSH connection failed after key copy"
        echo "Please check SSH server on host: sudo systemctl status sshd"
    fi
else
    echo ""
    echo -e "${RED}✗${NC} Failed to copy SSH key"
    echo ""
    echo "Manual setup:"
    echo "  1. On host, ensure SSH server is running:"
    echo "     sudo systemctl enable --now sshd"
    echo "  2. Copy the key manually:"
    echo "     ssh-copy-id $GATEWAY_IP"
fi
