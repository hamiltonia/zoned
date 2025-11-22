.PHONY: help install uninstall enable disable reload logs compile-schema test clean zip

# Extension details
EXTENSION_UUID = zonefancy@hamiltonia
EXTENSION_DIR = extension
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)

# Colors for output
COLOR_RESET = \033[0m
COLOR_INFO = \033[36m
COLOR_SUCCESS = \033[32m
COLOR_ERROR = \033[31m

help:
	@echo "$(COLOR_INFO)ZoneFancy GNOME Shell Extension - Makefile Commands$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_SUCCESS)Installation:$(COLOR_RESET)"
	@echo "  make install        - Install extension to local extensions directory"
	@echo "  make uninstall      - Remove extension from local extensions directory"
	@echo "  make enable         - Enable the extension"
	@echo "  make disable        - Disable the extension"
	@echo ""
	@echo "$(COLOR_SUCCESS)Development:$(COLOR_RESET)"
	@echo "  make reload         - Reload GNOME Shell (X11 only)"
	@echo "  make logs           - Follow extension logs"
	@echo "  make compile-schema - Compile GSettings schema"
	@echo "  make test           - Run tests"
	@echo ""
	@echo "$(COLOR_SUCCESS)Packaging:$(COLOR_RESET)"
	@echo "  make zip            - Create extension zip for distribution"
	@echo "  make clean          - Clean build artifacts"
	@echo ""
	@echo "$(COLOR_SUCCESS)All-in-one:$(COLOR_RESET)"
	@echo "  make dev            - Install, compile schema, and enable"
	@echo ""

install:
	@echo "$(COLOR_INFO)Installing ZoneFancy extension...$(COLOR_RESET)"
	@mkdir -p $(INSTALL_DIR)
	@cp -r $(EXTENSION_DIR)/* $(INSTALL_DIR)/
	@echo "$(COLOR_SUCCESS)Installation complete: $(INSTALL_DIR)$(COLOR_RESET)"
	@echo "$(COLOR_INFO)Don't forget to compile the schema: make compile-schema$(COLOR_RESET)"

uninstall:
	@echo "$(COLOR_INFO)Uninstalling ZoneFancy extension...$(COLOR_RESET)"
	@rm -rf $(INSTALL_DIR)
	@echo "$(COLOR_SUCCESS)Uninstalled successfully$(COLOR_RESET)"

enable:
	@echo "$(COLOR_INFO)Enabling ZoneFancy extension...$(COLOR_RESET)"
	@gnome-extensions enable $(EXTENSION_UUID)
	@echo "$(COLOR_SUCCESS)Extension enabled$(COLOR_RESET)"

disable:
	@echo "$(COLOR_INFO)Disabling ZoneFancy extension...$(COLOR_RESET)"
	@gnome-extensions disable $(EXTENSION_UUID)
	@echo "$(COLOR_SUCCESS)Extension disabled$(COLOR_RESET)"

reload:
	@echo "$(COLOR_INFO)Reloading GNOME Shell (X11 only)...$(COLOR_RESET)"
	@if [ "$$XDG_SESSION_TYPE" = "wayland" ]; then \
		echo "$(COLOR_ERROR)Cannot reload on Wayland. Please log out and log back in.$(COLOR_RESET)"; \
		exit 1; \
	fi
	@busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting…")' || \
		echo "$(COLOR_ERROR)Failed to reload. Try manually: Alt+F2, type 'r', press Enter$(COLOR_RESET)"
	@echo "$(COLOR_SUCCESS)GNOME Shell reloaded$(COLOR_RESET)"

logs:
	@echo "$(COLOR_INFO)Following ZoneFancy logs (Ctrl+C to stop)...$(COLOR_RESET)"
	@journalctl -f -o cat /usr/bin/gnome-shell | grep -i --line-buffered zonefancy

compile-schema:
	@echo "$(COLOR_INFO)Compiling GSettings schema...$(COLOR_RESET)"
	@if [ -d "$(INSTALL_DIR)/schemas" ]; then \
		glib-compile-schemas $(INSTALL_DIR)/schemas/; \
		echo "$(COLOR_SUCCESS)Schema compiled successfully$(COLOR_RESET)"; \
	else \
		echo "$(COLOR_ERROR)Extension not installed. Run 'make install' first.$(COLOR_RESET)"; \
		exit 1; \
	fi

test:
	@echo "$(COLOR_INFO)Running tests...$(COLOR_RESET)"
	@echo "$(COLOR_ERROR)No tests implemented yet$(COLOR_RESET)"

clean:
	@echo "$(COLOR_INFO)Cleaning build artifacts...$(COLOR_RESET)"
	@rm -f *.zip
	@find . -name "*.gschema.compiled" -delete
	@rm -rf build/ dist/
	@echo "$(COLOR_SUCCESS)Clean complete$(COLOR_RESET)"

zip:
	@echo "$(COLOR_INFO)Creating extension package...$(COLOR_RESET)"
	@mkdir -p build
	@cd $(EXTENSION_DIR) && zip -r ../build/$(EXTENSION_UUID).zip . -x "*.git*"
	@echo "$(COLOR_SUCCESS)Package created: build/$(EXTENSION_UUID).zip$(COLOR_RESET)"

# Convenience target for development workflow
dev: install compile-schema enable
	@echo "$(COLOR_SUCCESS)Development setup complete!$(COLOR_RESET)"
	@echo "$(COLOR_INFO)Extension installed, schema compiled, and enabled.$(COLOR_RESET)"
	@echo "$(COLOR_INFO)You may need to reload GNOME Shell (make reload) or log out/in.$(COLOR_RESET)"

# Quick reinstall during development
reinstall: uninstall install compile-schema
	@echo "$(COLOR_SUCCESS)Extension reinstalled$(COLOR_RESET)"
