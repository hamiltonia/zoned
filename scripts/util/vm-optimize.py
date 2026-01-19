#!/usr/bin/env python3
"""
VM Config Optimizer for libvirt/GNOME Boxes VMs
Applies VirtIO optimizations to improve VM performance.

Usage:
    ./vm-optimize.py                    # Interactive mode, qemu:///session
    ./vm-optimize.py --uri qemu:///system  # System VMs
    ./vm-optimize.py --vm "vm-name"     # Direct VM selection
"""

import sys
import argparse
import re
from copy import deepcopy
from typing import Optional
from difflib import unified_diff

try:
    import libvirt
    HAS_LIBVIRT = True
except ImportError:
    HAS_LIBVIRT = False

try:
    from lxml import etree
    HAS_LXML = True
except ImportError:
    HAS_LXML = False


# ─────────────────────────────────────────────────────────────────────────────
# Optimization Rules
# ─────────────────────────────────────────────────────────────────────────────

OPTIMIZATIONS = {
    "disk_bus": {
        "desc": "Disk bus: IDE/SATA → VirtIO",
        "detail": "VirtIO disk provides ~3x throughput, lower CPU overhead, TRIM support"
    },
    "disk_cache": {
        "desc": "Disk cache: → writeback + discard=unmap + io=threads",
        "detail": "Improves write performance and enables SSD TRIM passthrough"
    },
    "nic_model": {
        "desc": "NIC model: rtl8139/e1000 → VirtIO",
        "detail": "VirtIO NIC provides ~10x throughput, lower latency"
    },
    "video_model": {
        "desc": "Video: QXL/VGA → VirtIO-GPU",
        "detail": "Better Wayland support, enables 3D acceleration"
    },
    "video_accel": {
        "desc": "3D acceleration: Enable",
        "detail": "Hardware-accelerated graphics via host GPU"
    },
    "spice_gl": {
        "desc": "SPICE GL: Enable with rendernode",
        "detail": "GPU passthrough for display, reduces CPU usage"
    },
    "cpu_mode": {
        "desc": "CPU mode: → host-passthrough",
        "detail": "Exposes full host CPU features to guest"
    },
    "cpu_topology": {
        "desc": "CPU topology: Add cores/threads layout",
        "detail": "Helps guest scheduler optimize thread placement"
    }
}


def check_dependencies():
    """Verify required dependencies are available."""
    missing = []
    if not HAS_LIBVIRT:
        missing.append("libvirt-python (dnf install python3-libvirt)")
    if not HAS_LXML:
        missing.append("lxml (pip install lxml --break-system-packages)")
    
    if missing:
        print("Missing dependencies:", file=sys.stderr)
        for dep in missing:
            print(f"  - {dep}", file=sys.stderr)
        sys.exit(1)


def connect_libvirt(uri: str) -> libvirt.virConnect:
    """Connect to libvirt daemon."""
    try:
        conn = libvirt.open(uri)
        if conn is None:
            print(f"Failed to connect to {uri}", file=sys.stderr)
            sys.exit(1)
        return conn
    except libvirt.libvirtError as e:
        print(f"Connection error: {e}", file=sys.stderr)
        sys.exit(1)


def list_vms(conn: libvirt.virConnect) -> list[tuple[str, bool]]:
    """List all VMs with their running state."""
    vms = []
    for dom in conn.listAllDomains():
        name = dom.name()
        running = dom.isActive()
        vms.append((name, running))
    return sorted(vms, key=lambda x: x[0].lower())


def select_vm(vms: list[tuple[str, bool]]) -> Optional[str]:
    """Interactive VM selection."""
    if not vms:
        print("No VMs found.", file=sys.stderr)
        return None
    
    print("\nAvailable VMs:")
    print("-" * 40)
    for i, (name, running) in enumerate(vms, 1):
        status = "🟢 running" if running else "⚪ stopped"
        print(f"  {i:2}. {name} ({status})")
    print("-" * 40)
    
    while True:
        try:
            choice = input("\nSelect VM number (or 'q' to quit): ").strip()
            if choice.lower() == 'q':
                return None
            idx = int(choice) - 1
            if 0 <= idx < len(vms):
                return vms[idx][0]
            print(f"Please enter 1-{len(vms)}")
        except ValueError:
            print("Invalid input")
        except (EOFError, KeyboardInterrupt):
            print()
            return None


def get_vm_xml(conn: libvirt.virConnect, name: str) -> str:
    """Get VM XML configuration."""
    try:
        dom = conn.lookupByName(name)
        return dom.XMLDesc(0)
    except libvirt.libvirtError as e:
        print(f"Error getting VM config: {e}", file=sys.stderr)
        sys.exit(1)


def optimize_xml(xml_str: str) -> tuple[str, list[tuple[str, str, str]]]:
    """
    Apply optimizations to VM XML.
    Returns: (optimized_xml, list of (optimization_key, old_value, new_value))
    """
    root = etree.fromstring(xml_str.encode())
    changes = []
    
    # ─── Disk optimization ───
    for disk in root.xpath("//disk[@device='disk']"):
        target = disk.find("target")
        driver = disk.find("driver")
        
        if target is not None:
            old_bus = target.get("bus", "unknown")
            if old_bus in ("ide", "sata", "scsi"):
                # Change bus to virtio
                target.set("bus", "virtio")
                # Update device name (hda/sda → vda)
                old_dev = target.get("dev", "")
                if old_dev:
                    new_dev = re.sub(r'^[hs]d', 'vd', old_dev)
                    target.set("dev", new_dev)
                changes.append(("disk_bus", f"{old_bus} ({old_dev})", f"virtio ({new_dev})"))
        
        # Optimize driver settings
        if driver is not None:
            old_cache = driver.get("cache", "default")
            old_discard = driver.get("discard", "none")
            old_io = driver.get("io", "default")
            
            needs_change = (old_cache != "writeback" or 
                          old_discard != "unmap" or 
                          old_io != "threads")
            
            if needs_change:
                driver.set("cache", "writeback")
                driver.set("discard", "unmap")
                driver.set("io", "threads")
                changes.append(("disk_cache", 
                              f"cache={old_cache}, discard={old_discard}, io={old_io}",
                              "cache=writeback, discard=unmap, io=threads"))
    
    # ─── NIC optimization ───
    for iface in root.xpath("//interface"):
        model = iface.find("model")
        if model is not None:
            old_type = model.get("type", "unknown")
            if old_type in ("rtl8139", "e1000", "e1000e"):
                model.set("type", "virtio")
                changes.append(("nic_model", old_type, "virtio"))
    
    # ─── Video optimization ───
    for video in root.xpath("//video"):
        model = video.find("model")
        if model is not None:
            old_type = model.get("type", "unknown")
            if old_type in ("qxl", "vga", "cirrus"):
                model.set("type", "virtio")
                model.set("heads", "1")
                model.set("primary", "yes")
                
                # Add/update acceleration
                accel = model.find("acceleration")
                if accel is None:
                    accel = etree.SubElement(model, "acceleration")
                old_accel = accel.get("accel3d", "no")
                accel.set("accel3d", "yes")
                
                changes.append(("video_model", old_type, "virtio"))
                if old_accel != "yes":
                    changes.append(("video_accel", f"accel3d={old_accel}", "accel3d=yes"))
    
    # ─── SPICE GL optimization ───
    for graphics in root.xpath("//graphics[@type='spice']"):
        gl = graphics.find("gl")
        if gl is None:
            gl = etree.SubElement(graphics, "gl")
        
        old_enable = gl.get("enable", "no")
        if old_enable != "yes":
            gl.set("enable", "yes")
            if gl.get("rendernode") is None:
                gl.set("rendernode", "/dev/dri/renderD128")
            changes.append(("spice_gl", f"enable={old_enable}", "enable=yes"))
    
    # ─── CPU optimization ───
    cpu = root.find("cpu")
    if cpu is not None:
        old_mode = cpu.get("mode", "custom")
        if old_mode != "host-passthrough":
            cpu.set("mode", "host-passthrough")
            cpu.set("check", "none")
            cpu.set("migratable", "on")
            changes.append(("cpu_mode", old_mode, "host-passthrough"))
        
        # Add topology if missing
        vcpu_elem = root.find("vcpu")
        if vcpu_elem is not None:
            vcpu_count = int(vcpu_elem.text or "1")
            topology = cpu.find("topology")
            if topology is None:
                topology = etree.SubElement(cpu, "topology")
                topology.set("sockets", "1")
                topology.set("dies", "1")
                topology.set("clusters", "1")
                topology.set("cores", str(vcpu_count))
                topology.set("threads", "1")
                changes.append(("cpu_topology", "none", f"1 socket × {vcpu_count} cores × 1 thread"))
    else:
        # Create CPU element if missing
        vcpu_elem = root.find("vcpu")
        vcpu_count = int(vcpu_elem.text) if vcpu_elem is not None else 1
        
        cpu = etree.Element("cpu", mode="host-passthrough", check="none", migratable="on")
        topology = etree.SubElement(cpu, "topology")
        topology.set("sockets", "1")
        topology.set("dies", "1")
        topology.set("clusters", "1")
        topology.set("cores", str(vcpu_count))
        topology.set("threads", "1")
        
        # Insert after <vcpu> element
        if vcpu_elem is not None:
            vcpu_elem.addnext(cpu)
        else:
            root.append(cpu)
        
        changes.append(("cpu_mode", "default", "host-passthrough"))
        changes.append(("cpu_topology", "none", f"1 socket × {vcpu_count} cores × 1 thread"))
    
    # Generate optimized XML
    optimized = etree.tostring(root, encoding='unicode', pretty_print=True)
    
    # Ensure XML declaration
    if not optimized.startswith('<?xml'):
        optimized = '<?xml version="1.0" encoding="UTF-8"?>\n' + optimized
    
    return optimized, changes


def format_xml_for_diff(xml_str: str) -> list[str]:
    """Parse and re-format XML for consistent diffing."""
    try:
        root = etree.fromstring(xml_str.encode())
        formatted = etree.tostring(root, encoding='unicode', pretty_print=True)
        return formatted.splitlines(keepends=True)
    except Exception:
        return xml_str.splitlines(keepends=True)


def show_changes(changes: list[tuple[str, str, str]], original_xml: str, optimized_xml: str):
    """Display proposed changes."""
    if not changes:
        print("\n✓ VM is already optimized. No changes needed.")
        return False
    
    print("\n" + "=" * 60)
    print("PROPOSED OPTIMIZATIONS")
    print("=" * 60)
    
    for key, old_val, new_val in changes:
        opt = OPTIMIZATIONS.get(key, {"desc": key, "detail": ""})
        print(f"\n● {opt['desc']}")
        print(f"  Before: {old_val}")
        print(f"  After:  {new_val}")
        if opt['detail']:
            print(f"  → {opt['detail']}")
    
    print("\n" + "-" * 60)
    print("XML DIFF (abbreviated)")
    print("-" * 60)
    
    # Show unified diff
    orig_lines = format_xml_for_diff(original_xml)
    opt_lines = format_xml_for_diff(optimized_xml)
    
    diff = list(unified_diff(orig_lines, opt_lines, 
                            fromfile='original', tofile='optimized',
                            lineterm=''))
    
    # Show first 50 lines of diff
    diff_display = diff[:50]
    for line in diff_display:
        if line.startswith('+') and not line.startswith('+++'):
            print(f"\033[32m{line}\033[0m")  # Green
        elif line.startswith('-') and not line.startswith('---'):
            print(f"\033[31m{line}\033[0m")  # Red
        elif line.startswith('@@'):
            print(f"\033[36m{line}\033[0m")  # Cyan
        else:
            print(line)
    
    if len(diff) > 50:
        print(f"\n... ({len(diff) - 50} more lines)")
    
    print("-" * 60)
    return True


def apply_changes(conn: libvirt.virConnect, vm_name: str, optimized_xml: str) -> bool:
    """Apply optimized config to VM."""
    try:
        dom = conn.lookupByName(vm_name)
        is_running = dom.isActive()
        
        if is_running:
            print("\n⚠️  VM is running. Changes will apply on next boot.")
        
        # Define (update) the VM with new XML
        conn.defineXML(optimized_xml)
        print(f"\n✓ Configuration updated for '{vm_name}'")
        
        if is_running:
            print("  Restart the VM for changes to take effect.")
        
        return True
        
    except libvirt.libvirtError as e:
        print(f"\n✗ Failed to apply changes: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Optimize libvirt VM configurations for better performance",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          Interactive mode (GNOME Boxes VMs)
  %(prog)s --uri qemu:///system     System VMs
  %(prog)s --vm "my-vm"             Optimize specific VM
  %(prog)s --dry-run                Show changes without applying
        """
    )
    parser.add_argument("--uri", default="qemu:///session",
                       help="Libvirt connection URI (default: qemu:///session)")
    parser.add_argument("--vm", help="VM name (skip interactive selection)")
    parser.add_argument("--dry-run", action="store_true",
                       help="Show changes without applying")
    parser.add_argument("--yes", "-y", action="store_true",
                       help="Skip confirmation prompt")
    
    args = parser.parse_args()
    
    check_dependencies()
    
    print(f"Connecting to {args.uri}...")
    conn = connect_libvirt(args.uri)
    
    # Select VM
    if args.vm:
        vm_name = args.vm
    else:
        vms = list_vms(conn)
        vm_name = select_vm(vms)
        if vm_name is None:
            conn.close()
            return 0
    
    print(f"\nAnalyzing '{vm_name}'...")
    
    # Get and optimize
    original_xml = get_vm_xml(conn, vm_name)
    optimized_xml, changes = optimize_xml(original_xml)
    
    # Show changes
    has_changes = show_changes(changes, original_xml, optimized_xml)
    
    if not has_changes:
        conn.close()
        return 0
    
    if args.dry_run:
        print("\n[Dry run - no changes applied]")
        conn.close()
        return 0
    
    # Confirm and apply
    if not args.yes:
        try:
            confirm = input("\nApply these changes? [y/N]: ").strip().lower()
            if confirm not in ('y', 'yes'):
                print("Cancelled.")
                conn.close()
                return 0
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled.")
            conn.close()
            return 0
    
    success = apply_changes(conn, vm_name, optimized_xml)
    conn.close()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
