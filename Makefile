.PHONY: install build test dev clean agent-install agent-build agent-test ui-install ui-dev ui-build sea help

# Default target
help:
	@echo "Tendril — Makefile targets"
	@echo ""
	@echo "  make install       Install dependencies for agent and UI"
	@echo "  make build         Build agent sidecar (esbuild bundle)"
	@echo "  make test          Run agent tests"
	@echo "  make dev           Build agent sidecar then launch Tauri dev"
	@echo "  make sea           Build Node.js SEA binary"
	@echo "  make release       Build production Tauri app"
	@echo "  make clean         Remove build artifacts"
	@echo ""

# ── Dependencies ──────────────────────────────────────────────

install: agent-install ui-install

agent-install:
	cd tendril-agent && npm install

ui-install:
	cd tendril-ui && npm install

# ── Agent ─────────────────────────────────────────────────────

agent-build: agent-install
	cd tendril-agent && npm run build

agent-test:
	cd tendril-agent && npm test

sea: agent-build
	cd tendril-agent && npm run build:sea

# ── UI ────────────────────────────────────────────────────────

ui-dev: agent-build ui-install
	cd tendril-ui && cargo tauri dev

ui-build: agent-build ui-install
	cd tendril-ui && cargo tauri build

# ── Composite ─────────────────────────────────────────────────

build: agent-build

test: agent-test

dev: agent-build ui-dev

release: agent-build ui-build

clean:
	rm -rf tendril-agent/dist tendril-agent/node_modules
	rm -rf tendril-ui/dist tendril-ui/node_modules
	cd tendril-ui/src-tauri && cargo clean 2>/dev/null || true
