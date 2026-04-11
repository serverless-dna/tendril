.PHONY: install build test dev clean agent-install agent-build agent-test agent-lint ui-install ui-dev ui-build ui-lint ui-fmt sea sidecars deno-fetch lint fmt check help

TRIPLE := $(shell rustc --print host-tuple 2>/dev/null || echo "aarch64-apple-darwin")
BINDIR := tendril-ui/src-tauri/binaries
DENO_VERSION := 2.7.12

# Map Rust target triple to Deno download target
ifeq ($(TRIPLE),aarch64-apple-darwin)
  DENO_TARGET := aarch64-apple-darwin
endif
ifeq ($(TRIPLE),x86_64-apple-darwin)
  DENO_TARGET := x86_64-apple-darwin
endif
ifeq ($(TRIPLE),x86_64-unknown-linux-gnu)
  DENO_TARGET := x86_64-unknown-linux-gnu
endif
ifeq ($(TRIPLE),aarch64-unknown-linux-gnu)
  DENO_TARGET := aarch64-unknown-linux-gnu
endif
ifeq ($(TRIPLE),x86_64-pc-windows-msvc)
  DENO_TARGET := x86_64-pc-windows-msvc
endif
DENO_TARGET ?= $(TRIPLE)

# Default target
help:
	@echo "Tendril — Makefile targets"
	@echo ""
	@echo "  make install       Install dependencies for agent and UI"
	@echo "  make build         Build agent sidecar (esbuild bundle)"
	@echo "  make test          Run agent tests"
	@echo "  make dev           Build sidecars then launch Tauri dev"
	@echo "  make sea           Build Node.js SEA binary"
	@echo "  make release       Build production Tauri app"
	@echo "  make lint          Run all linters (clippy + eslint)"
	@echo "  make fmt           Check formatting (rustfmt + prettier)"
	@echo "  make check         Quality gate: fmt + lint + test"
	@echo "  make clean         Remove build artifacts"
	@echo ""
	@echo "  Platform: $(TRIPLE)"
	@echo "  Deno:     $(DENO_VERSION) ($(DENO_TARGET))"
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

# ── Deno (bundled dependency) ─────────────────────────────────

$(BINDIR)/deno-$(TRIPLE):
	@mkdir -p $(BINDIR)
	@echo "Downloading deno $(DENO_VERSION) for $(DENO_TARGET)..."
	@curl -fsSL "https://github.com/denoland/deno/releases/download/v$(DENO_VERSION)/deno-$(DENO_TARGET).zip" -o /tmp/deno-$(DENO_TARGET).zip
	@unzip -o -q /tmp/deno-$(DENO_TARGET).zip -d /tmp/deno-extract
	@mv /tmp/deno-extract/deno $(BINDIR)/deno-$(TRIPLE)
	@chmod +x $(BINDIR)/deno-$(TRIPLE)
	@rm -rf /tmp/deno-$(DENO_TARGET).zip /tmp/deno-extract
	@echo "Deno $(DENO_VERSION) installed to $(BINDIR)/deno-$(TRIPLE)"

deno-fetch: $(BINDIR)/deno-$(TRIPLE)

# ── Sidecars ──────────────────────────────────────────────────

sidecars: agent-build deno-fetch
	@mkdir -p $(BINDIR)
	@printf '#!/bin/sh\nnode %s/tendril-agent/dist/main.cjs "$$@"\n' "$(CURDIR)" > $(BINDIR)/tendril-agent-$(TRIPLE)
	@chmod +x $(BINDIR)/tendril-agent-$(TRIPLE)

# ── UI ────────────────────────────────────────────────────────

ui-dev: sidecars ui-install
	cd tendril-ui && cargo tauri dev

ui-build: sidecars ui-install
	cd tendril-ui && cargo tauri build

# ── Quality gates ─────────────────────────────────────────────

agent-lint:
	cd tendril-agent && npx tsc --noEmit

ui-fmt:
	cd tendril-ui/src-tauri && cargo fmt -- --check

ui-lint: sidecars
	cd tendril-ui/src-tauri && cargo clippy -- -D warnings

fmt: ui-fmt
	@echo "Format check passed"

lint: agent-lint ui-lint
	@echo "Lint passed"

check: fmt lint test
	@echo "Quality gate passed"

# ── Composite ─────────────────────────────────────────────────

build: agent-build

test: agent-test

dev: ui-dev

release: check ui-build

clean:
	rm -rf tendril-agent/dist tendril-agent/node_modules
	rm -rf tendril-ui/dist tendril-ui/node_modules
	rm -f $(BINDIR)/tendril-agent-* $(BINDIR)/deno-*
	cd tendril-ui/src-tauri && cargo clean 2>/dev/null || true
