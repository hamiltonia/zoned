#!/usr/bin/env python3
"""
Test Window for Zoned Extension Stability Tests

A minimal GTK4 window that exposes its geometry and state via D-Bus.
Used by window movement tests to verify zone assignments.

D-Bus Interface: org.zoned.TestWindow
Object Path: /org/zoned/TestWindow

Usage:
    # Start window
    python3 test-window.py &
    
    # Query geometry via D-Bus
    gdbus call -e -d org.zoned.TestWindow \
        -o /org/zoned/TestWindow \
        -m org.zoned.TestWindow.GetGeometry
    
    # Close window via D-Bus
    gdbus call -e -d org.zoned.TestWindow \
        -o /org/zoned/TestWindow \
        -m org.zoned.TestWindow.Close
"""

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gdk', '4.0')
from gi.repository import Gtk, Gdk, GLib, Gio
import sys
import json

# D-Bus interface XML
DBUS_INTERFACE_XML = """
<node>
  <interface name="org.zoned.TestWindow">
    <method name="GetGeometry">
      <arg direction="out" type="s" name="geometry"/>
    </method>
    <method name="GetState">
      <arg direction="out" type="s" name="state"/>
    </method>
    <method name="Focus">
      <arg direction="out" type="b" name="success"/>
    </method>
    <method name="Close">
      <arg direction="out" type="b" name="success"/>
    </method>
    <method name="Ping">
      <arg direction="out" type="s" name="response"/>
    </method>
  </interface>
</node>
"""

class TestWindow(Gtk.ApplicationWindow):
    """A simple test window with D-Bus state reporting."""
    
    def __init__(self, app):
        super().__init__(application=app, title="ZonedTestWindow")
        self.set_default_size(400, 300)
        
        # Create a simple label
        label = Gtk.Label(label="Zoned Test Window\n\nThis window is used for\nautomated stability testing.")
        label.set_halign(Gtk.Align.CENTER)
        label.set_valign(Gtk.Align.CENTER)
        self.set_child(label)
        
        # Track geometry changes
        self._x = 0
        self._y = 0
        self._width = 400
        self._height = 300
        
        # Connect to surface events for position tracking
        self.connect('realize', self._on_realize)
    
    def _on_realize(self, widget):
        """Called when window is realized."""
        # Get native surface for geometry tracking
        surface = self.get_surface()
        if surface:
            surface.connect('layout', self._on_layout)
    
    def _on_layout(self, surface, width, height):
        """Called when window layout changes."""
        self._width = width
        self._height = height
        # Note: Getting exact x,y position is tricky in GTK4/Wayland
        # We'll use the surface's device position when available
    
    def get_geometry(self):
        """Get current window geometry."""
        # In GTK4, getting the exact position is compositor-dependent
        # For X11, we can try to get it from the native surface
        x, y = 0, 0
        width, height = self._width, self._height
        
        surface = self.get_surface()
        if surface:
            width = surface.get_width()
            height = surface.get_height()
            
            # Try to get position (X11 only)
            try:
                display = self.get_display()
                if hasattr(display, 'get_default_screen'):
                    # X11 path
                    native = self.get_native()
                    if native:
                        x, y = native.get_surface().get_position()
            except Exception:
                pass
        
        return {
            'x': x,
            'y': y,
            'width': width,
            'height': height,
        }
    
    def get_state(self):
        """Get current window state."""
        return {
            'title': self.get_title(),
            'visible': self.get_visible(),
            'maximized': self.is_maximized(),
            'fullscreen': self.is_fullscreen(),
            'focused': self.is_active(),
        }
    
    def focus_window(self):
        """Attempt to focus this window."""
        self.present()
        return True


class DBusService:
    """D-Bus service for the test window."""
    
    def __init__(self, window):
        self._window = window
        self._bus_id = None
        self._registration_id = None
        
        # Register D-Bus service
        self._bus_id = Gio.bus_own_name(
            Gio.BusType.SESSION,
            'org.zoned.TestWindow',
            Gio.BusNameOwnerFlags.NONE,
            self._on_bus_acquired,
            self._on_name_acquired,
            self._on_name_lost,
        )
    
    def _on_bus_acquired(self, connection, name):
        """Called when D-Bus connection is acquired."""
        node_info = Gio.DBusNodeInfo.new_for_xml(DBUS_INTERFACE_XML)
        interface_info = node_info.lookup_interface('org.zoned.TestWindow')
        
        self._registration_id = connection.register_object(
            '/org/zoned/TestWindow',
            interface_info,
            self._on_method_call,
            None,
            None,
        )
    
    def _on_name_acquired(self, connection, name):
        """Called when D-Bus name is acquired."""
        print(f'[TestWindow] D-Bus name acquired: {name}')
    
    def _on_name_lost(self, connection, name):
        """Called when D-Bus name is lost."""
        print(f'[TestWindow] D-Bus name lost: {name}')
    
    def _on_method_call(self, connection, sender, object_path, interface_name,
                        method_name, parameters, invocation):
        """Handle D-Bus method calls."""
        try:
            if method_name == 'GetGeometry':
                geometry = self._window.get_geometry()
                result = GLib.Variant('(s)', (json.dumps(geometry),))
                invocation.return_value(result)
            
            elif method_name == 'GetState':
                state = self._window.get_state()
                result = GLib.Variant('(s)', (json.dumps(state),))
                invocation.return_value(result)
            
            elif method_name == 'Focus':
                success = self._window.focus_window()
                result = GLib.Variant('(b)', (success,))
                invocation.return_value(result)
            
            elif method_name == 'Close':
                # Schedule close on main loop
                GLib.idle_add(self._window.close)
                result = GLib.Variant('(b)', (True,))
                invocation.return_value(result)
            
            elif method_name == 'Ping':
                result = GLib.Variant('(s)', ('pong',))
                invocation.return_value(result)
            
            else:
                invocation.return_error_literal(
                    Gio.dbus_error_quark(),
                    Gio.DBusError.UNKNOWN_METHOD,
                    f'Unknown method: {method_name}'
                )
        except Exception as e:
            invocation.return_error_literal(
                Gio.dbus_error_quark(),
                Gio.DBusError.FAILED,
                str(e)
            )
    
    def cleanup(self):
        """Clean up D-Bus registration."""
        if self._bus_id:
            Gio.bus_unown_name(self._bus_id)


class TestWindowApp(Gtk.Application):
    """GTK Application for the test window."""
    
    def __init__(self):
        super().__init__(application_id='org.zoned.TestWindowApp')
        self._window = None
        self._dbus_service = None
    
    def do_activate(self):
        """Called when the application is activated."""
        if not self._window:
            self._window = TestWindow(self)
            self._dbus_service = DBusService(self._window)
        
        self._window.present()
        print('[TestWindow] Window opened and D-Bus service started')
    
    def do_shutdown(self):
        """Called when the application is shutting down."""
        if self._dbus_service:
            self._dbus_service.cleanup()
        Gtk.Application.do_shutdown(self)
        print('[TestWindow] Shutdown complete')


def main():
    """Main entry point."""
    app = TestWindowApp()
    return app.run(sys.argv)


if __name__ == '__main__':
    sys.exit(main())
