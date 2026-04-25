.PHONY: install build test dev clean agent-install agent-build agent-test agent-lint ui-install ui-dev ui-build ui-lint ui-fmt sea sidecars deno-fetch lint fmt check help

TRIPLE := $(shell rustc --print host-tuple 2>/dev/null || echo "aarch64-apple-darwin")
BINDIR := tendril-ui/src-tauri/binaries
DENO_VERSION := 2.7.12

# ── Platform detection ────────────────────────────────────────
ifeq ($(OS),Windows_NT)
  DETECTED_OS := Windows
  EXE_SUFFIX  := .exe
  DENO_BINARY := deno.exe
else
  DETECTED_OS := $(shell uname -s)
  EXE_SUFFIX  :=
  DENO_BINARY := deno
endif

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
ifeq ($(TRIPLE),aarch64-pc-windows-msvc)
  DENO_TARGET := aarch64-pc-windows-msvc
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
	@echo "  OS:       $(DETECTED_OS)"
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
	@echo "Building Node.js SEA for $(TRIPLE)..."
	cd tendril-agent && node --experimental-sea-config sea-config.json
	@cp "$$(command -v node)" tendril-agent/dist/tendril-agent$(EXE_SUFFIX)
ifeq ($(DETECTED_OS),Darwin)
	@codesign --remove-signature tendril-agent/dist/tendril-agent$(EXE_SUFFIX)
	@npx --prefix tendril-agent postject tendril-agent/dist/tendril-agent$(EXE_SUFFIX) NODE_SEA_BLOB tendril-agent/dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA
	@codesign --sign - tendril-agent/dist/tendril-agent$(EXE_SUFFIX)
else ifeq ($(DETECTED_OS),Windows)
	@npx --prefix tendril-agent postject tendril-agent/dist/tendril-agent$(EXE_SUFFIX) NODE_SEA_BLOB tendril-agent/dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
else
	@npx --prefix tendril-agent postject tendril-agent/dist/tendril-agent$(EXE_SUFFIX) NODE_SEA_BLOB tendril-agent/dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
endif
	@echo "SEA binary built: tendril-agent/dist/tendril-agent$(EXE_SUFFIX)"

# ── Deno (bundled dependency) ─────────────────────────────────

$(BINDIR)/deno-$(TRIPLE)$(EXE_SUFFIX):
	@mkdir -p $(BINDIR)
	@echo "Downloading deno $(DENO_VERSION) for $(DENO_TARGET)..."
	@curl -fsSL "https://github.com/denoland/deno/releases/download/v$(DENO_VERSION)/deno-$(DENO_TARGET).zip" -o "$(BINDIR)/_deno-download.zip"
	@unzip -o -q "$(BINDIR)/_deno-download.zip" -d "$(BINDIR)/_deno-extract"
	@mv "$(BINDIR)/_deno-extract/$(DENO_BINARY)" "$(BINDIR)/deno-$(TRIPLE)$(EXE_SUFFIX)"
ifneq ($(DETECTED_OS),Windows)
	@chmod +x "$(BINDIR)/deno-$(TRIPLE)$(EXE_SUFFIX)"
endif
	@rm -rf "$(BINDIR)/_deno-download.zip" "$(BINDIR)/_deno-extract"
	@echo "Deno $(DENO_VERSION) installed to $(BINDIR)/deno-$(TRIPLE)$(EXE_SUFFIX)"

deno-fetch: $(BINDIR)/deno-$(TRIPLE)$(EXE_SUFFIX)

# ── Sidecars ──────────────────────────────────────────────────

sidecars: sea deno-fetch
	@mkdir -p $(BINDIR)
	@cp "tendril-agent/dist/tendril-agent$(EXE_SUFFIX)" "$(BINDIR)/tendril-agent-$(TRIPLE)$(EXE_SUFFIX)"
	@chmod +x "$(BINDIR)/tendril-agent-$(TRIPLE)$(EXE_SUFFIX)" 2>/dev/null || true
	@echo "Sidecar installed: $(BINDIR)/tendril-agent-$(TRIPLE)$(EXE_SUFFIX)"

# ── UI ────────────────────────────────────────────────────────

ui-dev: sidecars ui-install
	cd tendril-ui && cargo tauri dev

ui-build: sidecars ui-install
	cd tendril-ui && cargo tauri build --target $(TRIPLE)

# ── Quality gates ─────────────────────────────────────────────

agent-lint:
	cd tendril-agent && npx tsc --noEmit

ui-fmt:
	cd tendril-ui/src-tauri && cargo fmt -- --check

ui-lint: sidecars
	cd tendril-ui/src-tauri && cargo clippy --target $(TRIPLE) -- -D warnings

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
	rm -f $(BINDIR)/tendril-agent-* $(BINDIR)/deno-* $(BINDIR)/main.cjs
	rm -rf $(BINDIR)/_deno-*
	cd tendril-ui/src-tauri && cargo clean 2>/dev/null || true
