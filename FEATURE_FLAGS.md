# Feature Flags Documentation

This document outlines the feature flags available in Amp Orchestra and their migration strategy.

## Available Feature Flags

### `legacy_node`

**Purpose**: Enable legacy Node.js integration compatibility layer during migration to unified architecture.

**Default**: `OFF` (modern implementation)

**Migration Strategy**: This feature flag enables a compatibility window where both legacy and modern implementations can coexist, allowing for safe iterative migration without breaking existing functionality.

#### Usage

**Building with legacy_node enabled:**
```bash
# Build with legacy node support
cargo build --features legacy_node

# Run tests with legacy node support  
cargo test --features legacy_node

# Build without legacy node support (default)
cargo build
```

**Feature flag dependencies:**
- `unified-core`: Contains the core feature flag definition
- `desktop-ui`: Passes through the feature to unified-core

#### Implementation Guidelines

1. **Code Structure**: Use `#[cfg(feature = "legacy_node")]` for conditional compilation
2. **Default Behavior**: The modern implementation should be the default (feature OFF)
3. **Testing**: Both feature configurations are tested in CI automatically
4. **Migration Path**: 
   - Phase 1: Implement modern code alongside legacy (current phase)
   - Phase 2: Migrate functionality incrementally
   - Phase 3: Remove legacy code and feature flag

#### CI Configuration

The CI matrix automatically tests both configurations:
- **Modern builds**: `features = ""`
- **Legacy builds**: `features = "legacy_node"`

This ensures that:
- Existing functionality continues to work (legacy_node OFF)
- New implementations don't break during development (legacy_node ON)
- Both code paths remain functional throughout migration

## Adding New Feature Flags

1. Add to `unified-core/Cargo.toml` features section
2. Add to `desktop-ui/src-tauri/Cargo.toml` with dependency passthrough
3. Update CI matrix in `.github/workflows/cross-platform-ci.yml`
4. Document the flag and migration strategy in this file
5. Use `#[cfg(feature = "flag_name")]` for conditional compilation

## Current Migration Status

- ✅ Feature flag infrastructure in place
- ✅ CI testing both configurations  
- ⏳ Legacy implementation compatibility layer
- ⏳ Modern implementation development
- ⏳ Incremental migration process
- ⏳ Legacy code removal
