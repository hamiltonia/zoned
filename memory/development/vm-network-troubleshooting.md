# VM Network Troubleshooting - Docker + GNOME Boxes

**Last Updated:** 2025-11-22

This document covers networking issues when running GNOME Boxes VMs on a host with Docker installed. The combination causes conflicts with iptables FORWARD chain policies.

---

## Quick Summary

**Problem:** GNOME Boxes VM can reach gateway (192.168.122.1) but cannot access the internet.

**Root Causes:**
1. Docker sets FORWARD chain to DROP policy
2. No iptables rules allowing virbr0 traffic
3. NAT masquerading missing for VM subnet (192.168.122.0/24)
4. VM must be running for network bridge to activate
5. GNOME Boxes uses user session libvirt, not system libvirt

**Quick Fix:**
```bash
# On HOST - Add NAT and forwarding rules
sudo iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -o wlp59s0 -j MASQUERADE
sudo iptables -I FORWARD 1 -i virbr0 -j ACCEPT
sudo iptables -I FORWARD 1 -o virbr0 -j ACCEPT

# Start the VM (it must be running!)
virsh --connect qemu:///session start "vm-name"

# Test in VM
ping 8.8.8.8
```

---

## Table of Contents

1. [Understanding the Problem](#understanding-the-problem)
2. [Diagnostic Process](#diagnostic-process)
3. [The Fix](#the-fix)
4. [Making Changes Persistent](#making-changes-persistent)
5. [Prevention for New VMs](#prevention-for-new-vms)
6. [Quick Reference Commands](#quick-reference-commands)

---

## Understanding the Problem

### Network Architecture

```
Physical Network (192.168.4.0/24)
    ↓
Host Machine (192.168.4.130 via wlp59s0)
    ↓
Virtual Network Bridge (virbr0: 192.168.122.1)
    ↓
VM (192.168.122.239)
```

For the VM to access internet:
1. Packets leave VM → arrive at virbr0 (192.168.122.1)
2. Host FORWARD rules must allow virbr0 traffic
3. Host NAT (MASQUERADE) rewrites source IP to host's IP (192.168.4.130)
4. Packets exit via physical interface (wlp59s0)
5. Replies come back, get un-NATed, forwarded to VM

### Why Docker Breaks This

Docker sets up its own networking:
```bash
Chain FORWARD (policy DROP)
 pkts bytes target     prot opt in     out     source               destination
 3009  310K DOCKER-USER  all  --  *      *       0.0.0.0/0            0.0.0.0/0
 3009  310K DOCKER-FORWARD  all  --  *      *       0.0.0.0/0            0.0.0.0/0
```

**Problem:** Default policy is DROP, and only Docker-related rules exist. No rules for virbr0!

### GNOME Boxes Uses User Session

Critical gotcha: GNOME Boxes runs VMs in **user session** libvirt:
```bash
# WRONG - shows nothing
sudo virsh list --all

# CORRECT - shows GNOME Boxes VMs
virsh --connect qemu:///session list --all
```

This affects:
- Where VMs are listed
- Which networks are available
- Where configurations are stored

---

## Diagnostic Process

### 1. Verify Basic Connectivity (In VM)

```bash
# Can reach gateway?
ping -c 3 192.168.122.1
# ✓ Works = routing is configured

# Can reach internet by IP?
ping -c 3 8.8.8.8
# ✗ Fails = NAT/forwarding issue

# Can resolve DNS?
ping -c 3 google.com
# Works if DNS resolution happens, but packets don't go through
```

### 2. Check VM Routing (In VM)

```bash
ip route show
# Expected output:
# default via 192.168.122.1 dev enp1s0 proto dhcp src 192.168.122.239 metric 20100
# 192.168.122.0/24 dev enp1s0 proto kernel scope link src 192.168.122.239 metric 100

# If no default route, that's the problem (different fix)
```

### 3. Check Host Forwarding (On Host)

```bash
# Is IP forwarding enabled?
cat /proc/sys/net/ipv4/ip_forward
# Must be: 1

# Check FORWARD chain
sudo iptables -L FORWARD -n -v --line-numbers
# Look for:
# - Policy: DROP (problem if no virbr0 rules)
# - Rules allowing virbr0 traffic
```

### 4. Check NAT Rules (On Host)

```bash
# Check POSTROUTING (NAT) rules
sudo iptables -t nat -L POSTROUTING -n -v --line-numbers

# Need to see:
# MASQUERADE  all  --  *  wlp59s0  192.168.122.0/24  !192.168.122.0/24
```

### 5. Check Bridge Status (On Host)

```bash
# Get your physical interface name
ip route show default
# Note the interface (wlp59s0, enp2s0, eth0, etc.)

# Check if virbr0 is up
ip addr show virbr0
# Should show: state UP or UNKNOWN (UNKNOWN is okay)
# If it shows: NO-CARRIER and state DOWN = nothing connected

# Check what's connected to the bridge
ls -l /sys/class/net/virbr0/brif/
# Should show: vnet0 (or similar) when VM is running
# Empty = VM not running or not connected!
```

### 6. Verify VM is Running (On Host)

```bash
# List VMs in user session (GNOME Boxes)
virsh --connect qemu:///session list --all

# Check specific VM network config
virsh --connect qemu:///session domiflist "fedora-dev-42"

# Should show:
# Interface   Type     Source   Model    MAC
# -           bridge   virbr0   virtio   52:54:00:xx:xx:xx
```

---

## The Fix

### Step 1: Enable IP Forwarding

```bash
# On HOST

# Check current status
cat /proc/sys/net/ipv4/ip_forward

# Enable temporarily
sudo sysctl -w net.ipv4.ip_forward=1

# Make permanent
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-libvirt.conf
```

### Step 2: Add FORWARD Rules for virbr0

```bash
# On HOST

# Allow traffic to/from virbr0 (add at TOP of chain, before DROP policy)
sudo iptables -I FORWARD 1 -i virbr0 -j ACCEPT
sudo iptables -I FORWARD 1 -o virbr0 -j ACCEPT

# Verify rules were added
sudo iptables -L FORWARD -n -v --line-numbers
# Should show rules 1 and 2 as ACCEPT for virbr0
```

### Step 3: Add NAT Masquerading

```bash
# On HOST

# First, identify your physical network interface
ip route show default
# Look for: default via X.X.X.X dev wlp59s0
# Note the interface name (wlp59s0, enp2s0, etc.)

# Add MASQUERADE rule (replace wlp59s0 with your interface)
sudo iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -o wlp59s0 -j MASQUERADE

# Verify
sudo iptables -t nat -L POSTROUTING -n -v --line-numbers
```

### Step 4: Start the VM

```bash
# On HOST

# List VMs
virsh --connect qemu:///session list --all

# Start the VM (replace with your VM name)
virsh --connect qemu:///session start "fedora-dev-42"

# Verify virbr0 gets a connection
ls -l /sys/class/net/virbr0/brif/
# Should now show: vnet0 or similar

# Check virbr0 status
ip addr show virbr0
# Should show: state UNKNOWN (good) instead of NO-CARRIER
```

### Step 5: Test in VM

```bash
# In the VM

# Test internet by IP
ping -c 3 8.8.8.8
# Should work now!

# Test DNS
ping -c 3 google.com
# Should work!

# Test package manager
sudo dnf check-update
# Should be able to download package lists
```

---

## Making Changes Persistent

The iptables rules above will be lost on reboot. Use firewalld to make them permanent:

```bash
# On HOST

# Add persistent NAT rule (replace wlp59s0 with your interface)
sudo firewall-cmd --permanent --direct --add-rule ipv4 nat POSTROUTING 0 -s 192.168.122.0/24 ! -d 192.168.122.0/24 -o wlp59s0 -j MASQUERADE

# Add persistent FORWARD rules
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -i virbr0 -j ACCEPT
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -o virbr0 -j ACCEPT

# Reload firewalld
sudo firewall-cmd --reload

# Verify rules persist
sudo firewall-cmd --direct --get-all-rules
```

**Verify After Reboot:**

```bash
# After rebooting host, check rules are still there:
sudo iptables -t nat -L POSTROUTING -n -v
sudo iptables -L FORWARD -n -v --line-numbers
```

---

## Prevention for New VMs

When setting up a second VM (e.g., fedora-dev-43), you can avoid this entire issue by setting up the rules BEFORE creating the VM:

### Pre-Setup Checklist

```bash
# 1. Enable IP forwarding permanently
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-libvirt.conf
sudo sysctl -p /etc/sysctl.d/99-libvirt.conf

# 2. Get your physical interface name
ip route show default | grep -oP 'dev \K\S+'
# Save this for next step (e.g., wlp59s0)

# 3. Add persistent firewall rules (replace wlp59s0)
PHYS_IFACE="wlp59s0"  # Your interface from step 2

sudo firewall-cmd --permanent --direct --add-rule ipv4 nat POSTROUTING 0 -s 192.168.122.0/24 ! -d 192.168.122.0/24 -o $PHYS_IFACE -j MASQUERADE
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -i virbr0 -j ACCEPT
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -o virbr0 -j ACCEPT
sudo firewall-cmd --reload

# 4. Verify rules are active
sudo iptables -t nat -L POSTROUTING -n -v | grep 192.168.122
sudo iptables -L FORWARD -n -v | grep virbr0

# 5. Now create your VM in GNOME Boxes
# Network should work immediately!
```

---

## Quick Reference Commands

### Checking VM Status

```bash
# List all VMs (GNOME Boxes uses user session)
virsh --connect qemu:///session list --all

# Show VM network configuration
virsh --connect qemu:///session domiflist "vm-name"

# Start/stop VM
virsh --connect qemu:///session start "vm-name"
virsh --connect qemu:///session shutdown "vm-name"

# Rename VM
virsh --connect qemu:///session domrename "old-name" "new-name"
```

### Checking Network Status

```bash
# Check IP forwarding
cat /proc/sys/net/ipv4/ip_forward

# Check virbr0 status
ip addr show virbr0

# Check what's connected to virbr0
ls -l /sys/class/net/virbr0/brif/

# Get physical interface name
ip route show default
```

### Checking iptables Rules

```bash
# Show FORWARD chain with line numbers
sudo iptables -L FORWARD -n -v --line-numbers

# Show NAT rules with line numbers
sudo iptables -t nat -L POSTROUTING -n -v --line-numbers

# Watch packet counters (run command, then test in VM, run again)
sudo iptables -L FORWARD -n -v --line-numbers
```

### Adding/Removing iptables Rules

```bash
# Add FORWARD rule (insert at position 1)
sudo iptables -I FORWARD 1 -i virbr0 -j ACCEPT

# Delete FORWARD rule by line number
sudo iptables -D FORWARD 2

# Add NAT rule
sudo iptables -t nat -A POSTROUTING -s 192.168.122.0/24 -o wlp59s0 -j MASQUERADE

# Delete NAT rule by line number
sudo iptables -t nat -D POSTROUTING 3
```

### Testing from VM

```bash
# In VM - Basic connectivity tests
ping -c 3 192.168.122.1    # Gateway (host bridge)
ping -c 3 8.8.8.8          # Internet by IP
ping -c 3 google.com       # DNS + Internet
curl -I https://google.com # HTTPS connectivity
sudo dnf check-update      # Package manager
```

---

## Common Scenarios

### Scenario: VM was working, stopped after host reboot

**Cause:** iptables rules were temporary

**Fix:** Make rules persistent (see "Making Changes Persistent" section)

### Scenario: Second VM has same problem

**Cause:** Rules only added reactively, not proactively

**Fix:** Follow "Prevention for New VMs" section before creating new VMs

### Scenario: Can ping gateway but not internet

**Cause:** FORWARD or NAT rules missing

**Fix:** Follow diagnostic process, likely Step 2 or 3 of "The Fix"

### Scenario: virsh shows no VMs

**Cause:** Using system libvirt instead of user session

**Fix:** Add `--connect qemu:///session` to virsh commands

### Scenario: virbr0 shows "NO-CARRIER"

**Cause:** VM not running, or not connected to bridge

**Fix:** Start the VM: `virsh --connect qemu:///session start "vm-name"`

---

## Notes

- **Docker** sets FORWARD policy to DROP by default
- **virbr0** only shows as UP/UNKNOWN when a VM is connected to it
- **GNOME Boxes** uses user session libvirt (`qemu:///session`), not system
- **NAT** rule must specify output interface (`-o wlp59s0`) to work properly
- **FORWARD** rules must be inserted BEFORE Docker rules (use `-I FORWARD 1`)

---

## Related Documentation

- [VM Setup Guide](../../docs/VM-SETUP-GUIDE.md) - Main VM setup instructions
- [VM Workflow](./vm-workflow.md) - Daily development workflow with VMs
- [Docker Networking](https://docs.docker.com/network/iptables/) - How Docker uses iptables
- [Libvirt Networking](https://wiki.libvirt.org/page/Networking) - Understanding libvirt networks

---

## Troubleshooting History

**2025-11-22:** Initial troubleshooting on Fedora 43 host with Docker installed
- Spent ~1 hour debugging networking
- Root cause: Docker FORWARD policy + missing NAT rules + VM not running
- Solution documented in this guide
- Host: Fedora 43 (Wayland), WiFi interface wlp59s0
- VM: Fedora 42 (X11), GNOME Boxes, NAT networking via virbr0
