# Unified Core

The unified-core crate is the foundation for the Amp Orchestra migration, providing domain models, traits, and implementations for unified session management, Git worktree operations, and evaluation frameworks.

## Overview

This crate consolidates the core functionality from both `amp-orchestra` and `amp-orchestrator` repositories into a single, well-defined Rust library that serves as the foundation for the unified Tauri application.

## Key Components

### Domain Models

- **Session**: Enhanced session model with worktree integration, agent modes, toolbox support, and evaluation capabilities
- **Batch**: Parallel batch processing with concurrency control and progress monitoring  
- **Benchmark**: Comprehensive evaluation framework supporting SWE-bench and custom benchmarks
- **WorktreeInfo**: Git worktree metadata and management information

### Git Backend Trait

The `GitBackend` trait defines five core async operations:

1. `create_worktree` - Create isolated worktree for session
2. `list_worktrees` - Enumerate all active worktrees
3. `cleanup_worktree` - Safe cleanup of worktree and branch
4. `validate_clean` - Check working directory cleanliness
5. `is_branch_existing` - Verify branch existence

### Persistence Traits

Three storage traits provide flexible persistence options:

- `SessionStore` - Session lifecycle management
- `BatchStore` - Batch processing storage
- `BenchmarkStore` - Evaluation results storage

## Features

### Default Features
- Core domain models and traits
- In-memory storage implementations
- Git backend trait and standard implementation

### Optional Features

- **`persistence`** - Enables SQLite persistence via `sqlx`
- **`legacy_node`** - Node.js compatibility layer for migration from amp-orchestrator

## Usage

Add to your `Cargo.toml`:

```toml
[dependencies]
unified-core = { path = "../unified-core", features = ["persistence"] }
```

Basic usage:

```rust
use unified_core::*;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<()> {
    // Create a new session
    let session = Session::new(
        "My Session".to_string(),
        "Implement authentication".to_string(),
        PathBuf::from("/tmp/repo"),
        "main".to_string(),
    );

    // Create storage
    let store = InMemoryStore::new();
    store.create_session(&session).await?;

    // Create Git backend
    let git = StandardGitBackend::new(PathBuf::from("/tmp/repo"));
    git.initialize().await?;
    
    let worktrees = git.list_worktrees().await?;
    println!("Active worktrees: {}", worktrees.len());

    Ok(())
}
```

## Architecture

### Domain-Driven Design
The crate follows domain-driven design principles with clear separation between:
- **Domain models** - Core business entities and value objects
- **Interfaces** - Traits defining required capabilities
- **Implementations** - Concrete implementations of interfaces

### Async-First
All I/O operations are async-native using `tokio`, providing excellent performance and scalability for concurrent operations.

### Error Handling
Comprehensive error handling using `thiserror` with specific error types for different operation categories:
- `SessionError` - Session management errors
- `GitError` - Git operation errors  
- `PersistenceError` - Storage operation errors

### Testing
Extensive test coverage including:
- Unit tests for all core functionality
- Integration tests for component interactions
- Property-based testing for complex operations
- Mocking support for external dependencies

## Migration Support

### Legacy Node.js Compatibility

The `legacy_node` feature provides compatibility layers for migrating from the Node.js amp-orchestrator:

```rust
use unified_core::legacy_node::*;

// Convert from legacy format
let session = Session::from_legacy(legacy_session)?;

// Export to legacy format  
let legacy_batch = batch.to_legacy();

// Bulk migration utilities
let sessions = LegacyMigration::load_legacy_sessions(&path).await?;
```

### Database Migration

When using the `persistence` feature, the SQLite implementation provides migration support:

```rust
let pool = SqlitePool::connect("sqlite:app.db").await?;
let store = SqliteStore::new(pool);
store.initialize().await?; // Creates tables if needed
```

## Performance Considerations

- **Zero-copy operations** where possible using references and borrowed data
- **Efficient serialization** with `serde` binary formats for internal storage
- **Lazy loading** of large datasets and evaluation results
- **Connection pooling** for database operations
- **Batch operations** for bulk data processing

## Development

### Running Tests

```bash
# All tests
cargo test

# With legacy Node.js support
cargo test --features legacy_node

# With persistence
cargo test --features persistence

# All features
cargo test --all-features
```

### Running Examples

```bash
cargo run --example basic_usage
```

### Building

```bash
# Development build
cargo build

# Release build
cargo build --release

# Check without building
cargo check --all-features
```

## Integration with Desktop UI

The unified-core crate is designed to be consumed by the Tauri desktop application:

```rust
// In desktop-ui/src-tauri/Cargo.toml
[dependencies]
unified-core = { path = "../../unified-core", features = ["persistence"] }
```

The desktop UI uses unified-core through Tauri command handlers:

```rust
#[tauri::command]
async fn create_session(
    config: CreateSessionConfig,
    state: State<'_, AppState>,
) -> Result<SessionResponse, String> {
    let session = Session::new(config.name, config.prompt, config.repo_root, config.base_branch);
    state.session_store.create_session(&session).await?;
    Ok(SessionResponse::from(session))
}
```

This provides a clean separation between the UI layer and business logic, enabling:
- **Type safety** - Strong typing across the Rust/TypeScript boundary
- **Performance** - In-process calls without IPC overhead
- **Testability** - Business logic can be tested independently
- **Maintainability** - Clear architectural boundaries

## Future Enhancements

- **Distributed backends** - Support for remote Git repositories
- **Advanced metrics** - Real-time performance monitoring
- **Plugin system** - Extensible evaluation frameworks
- **Cloud integration** - Remote storage and compute backends
- **GraphQL API** - Type-safe API generation from domain models
