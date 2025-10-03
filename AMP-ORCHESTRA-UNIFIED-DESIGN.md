# Amp Orchestra — Unified Design Specification v3.0

> **Mission**: Deliver a production-ready desktop application that unifies the strengths of amp-orchestra and amp-orchestrator, inspired by Conductor.build and Crystal patterns, providing comprehensive AI agent orchestration with parallel execution, evaluation benchmarks, and advanced developer workflows.

---

## Executive Summary

This specification consolidates two existing Amp orchestration systems into a unified Tauri-based architecture that combines:

- **amp-orchestra**: Modern Tauri/Rust foundation with agent modes, toolbox resolver, and runtime environment management
- **amp-orchestrator**: Mature session management, Git worktrees, and evaluation frameworks (ported to Rust)
- **Conductor.build patterns**: Parallel agent coordination, dispatcher architecture, and workspace isolation
- **Crystal insights**: Git worktree isolation, batch processing frameworks, and multi-session orchestration

The unified system provides a single, lightweight Tauri application (~40MB) with native Rust performance for AI-assisted development, comprehensive testing, benchmarking, and parallel execution capabilities.

---

## 1. High-Level Architecture

### Core Principles

1. **Native Rust Performance**: Single Tauri application with in-process Rust core for maximum performance
2. **Git-First Isolation**: Worktrees provide true isolation for parallel operations
3. **Comprehensive Testing**: Built-in evaluation frameworks and batch processing
4. **Lightweight Deployment**: ~40MB installer with no external dependencies
5. **Developer Experience**: Seamless switching between environments and configurations

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tauri Desktop Application                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    React Frontend                           │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │ │
│  │  │   Sessions  │ │   Batches   │ │ Benchmarks  │           │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘           │ │
│  └─────────────────────┬───────────────────────────────────────┘ │
│                        │ Tauri IPC Commands                      │
│  ┌─────────────────────▼───────────────────────────────────────┐ │
│  │                 Rust Backend (In-Process)                   │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │ │
│  │  │ Session     │ │ Worktree    │ │ Batch       │ │ Agent   │ │ │
│  │  │ Manager     │ │ Manager     │ │ Runner      │ │ Dispatch│ │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │ │
│  │  │ Runtime     │ │ Metrics     │ │ Benchmark   │ │ Toolbox │ │ │
│  │  │ Environment │ │ Collector   │ │ Harness     │ │ Resolver│ │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │ │
│  └─────────────────────┬───────────────────────────────────────┘ │
└─────────────────────────┼─────────────────────────────────────────┘
                          │ Process Spawning
┌─────────────────────────▼───────────────────────────────────────┐
│                       Amp CLI                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ Production  │ │ Local Dev   │ │ Custom      │               │
│  │ Service     │ │ Server      │ │ Binary      │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 Unified Session Model

Consolidates session management from both repositories with enhanced capabilities:

```rust
pub struct Session {
    pub id: SessionId,
    pub name: String,
    pub prompt: String,
    pub repo_root: PathBuf,
    pub base_branch: String,
    pub branch_name: String,
    pub worktree_path: PathBuf,
    pub status: SessionStatus,
    
    // Enhanced configuration
    pub agent_mode: Option<AgentMode>,
    pub toolbox_path: Option<PathBuf>,
    pub mcp_servers: Vec<McpServerConfig>,
    pub runtime_config: RuntimeConfig,
    
    // Evaluation support
    pub benchmark_config: Option<BenchmarkConfig>,
    pub batch_id: Option<BatchId>,
    pub metrics: MetricsCollector,
    
    // Timing and lifecycle
    pub created_at: DateTime<Utc>,
    pub last_run: Option<DateTime<Utc>>,
    pub timeout: Option<Duration>,
}

pub enum SessionStatus {
    Initializing,
    Idle,
    Running,
    AwaitingInput,
    Evaluating,
    Error(String),
    Completed,
}
```

### 2.2 Git Worktree Manager

Enhanced from amp-orchestrator with Crystal-inspired patterns:

```rust
pub struct WorktreeManager {
    pub repo_root: PathBuf,
    pub worktrees_dir: PathBuf, // .worktrees/
}

impl WorktreeManager {
    pub async fn create_session_worktree(
        &self,
        session_id: &SessionId,
        base_branch: &str,
        branch_name: &str,
    ) -> Result<PathBuf, WorktreeError> {
        // 1. Validate base branch exists and is clean
        // 2. Create isolated branch
        // 3. Create worktree at .worktrees/{session_id}
        // 4. Initialize AGENT_CONTEXT directory
        // 5. Return worktree path
    }
    
    pub async fn cleanup_worktree(
        &self,
        session_id: &SessionId,
    ) -> Result<(), WorktreeError> {
        // Safe cleanup with proper Git operations
    }
    
    pub async fn list_worktrees(&self) -> Result<Vec<WorktreeInfo>, WorktreeError> {
        // Enumerate all active worktrees
    }
}
```

### 2.3 Parallel Agent Dispatcher

Inspired by Conductor.build's dispatcher architecture:

```rust
pub struct AgentDispatcher {
    pub session_pool: SessionPool,
    pub concurrency_limit: usize,
    pub queue: TaskQueue,
}

impl AgentDispatcher {
    pub async fn spawn_parallel_sessions(
        &self,
        batch_config: &BatchConfig,
    ) -> Result<Vec<SessionHandle>, DispatchError> {
        // Create isolated sessions with proper resource management
        // Each session gets its own worktree and environment
    }
    
    pub async fn coordinate_evaluation(
        &self,
        eval_config: &EvaluationConfig,
    ) -> Result<EvaluationResults, DispatchError> {
        // Orchestrate multi-agent evaluation runs
    }
}

pub struct SessionHandle {
    pub session_id: SessionId,
    pub worktree_path: PathBuf,
    pub process_handle: ProcessHandle,
    pub message_stream: MessageStream,
}
```

### 2.4 Enhanced Runtime Environment

Extended from amp-orchestra with full feature support:

```rust
pub struct RuntimeEnvironment {
    pub env_kind: EnvKind,
    pub amp_config: AmpConfig,
    pub agent_mode: Option<AgentMode>,
    pub toolbox_config: ToolboxConfig,
    pub mcp_config: McpConfig,
}

impl RuntimeEnvironment {
    pub fn compose_environment(
        &self,
        session: &Session,
    ) -> Result<ProcessEnvironment, RuntimeError> {
        // Compose complete environment with:
        // - AMP_EXPERIMENTAL_AGENT_MODE
        // - AMP_TOOLBOX path
        // - PATH modifications
        // - MCP server configurations
        // - Security constraints
    }
}

pub enum EnvKind {
    Production,
    LocalDevelopment,
    CI,
}

pub enum AgentMode {
    Default,
    Geppetto,
    Claudetto,
    GronkFast,
    Bolt,
    Custom(String),
}
```

### 2.5 Comprehensive Batch Processing

Enhanced from amp-orchestrator with parallel execution:

```yaml
# batch-config.yaml - Enhanced configuration schema
version: 3
metadata:
  name: "Comprehensive Evaluation Suite"
  description: "Multi-model, multi-agent evaluation framework"
  
execution:
  concurrency: 8
  timeout_sec: 1800
  retry_policy:
    max_attempts: 3
    backoff_ms: 1000

environments:
  production:
    amp_server_url: "https://ampcode.com"
  development:
    amp_cli_path: "/path/to/local/amp/cli/dist/main.js"
    amp_server_url: "https://localhost:7002"

# Agent configuration matrix
agents:
  - id: "default-sonnet"
    agent_mode: "default"
    model_override: "claude-3-5-sonnet"
  - id: "geppetto-gpt5"
    agent_mode: "geppetto:main" 
    model_override: "gpt-5"
  - id: "custom-toolbox"
    agent_mode: "default"
    toolbox_path: "./custom-tools"
    mcp_servers: ["playwright", "linear"]

# Evaluation tasks
tasks:
  - id: "swe-bench-lite"
    type: "evaluation"
    dataset: "swe-bench-lite"
    cases_dir: "./eval_data/swebench"
    script_command: "python -m pytest"
    
  - id: "custom-benchmarks"
    type: "batch"
    prompts:
      - "Implement JWT authentication system"
      - "Add comprehensive error handling"
      - "Optimize database queries"
    repositories:
      - "./backend-service"
      - "./frontend-app"
      - "./mobile-client"

# Metrics collection
metrics:
  collection:
    - success_rate
    - avg_iterations
    - token_usage
    - cost_analysis
    - execution_time
    - tool_usage_stats
  export_formats: ["jsonl", "csv", "html"]
```

### 2.6 Advanced Toolbox System

Enhanced from amp-orchestra with MCP integration:

```rust
pub struct ToolboxResolver {
    pub runtime_dir: PathBuf, // ~/.amp-orchestra/runtime_toolboxes/
    pub security_config: SecurityConfig,
}

impl ToolboxResolver {
    pub async fn resolve_toolbox_set(
        &self,
        toolbox_paths: Vec<PathBuf>,
        session_id: &SessionId,
    ) -> Result<ResolvedToolbox, ToolboxError> {
        // Create symlink fan-in with Windows fallback
        // Apply security constraints
        // Generate runtime directory
    }
    
    pub async fn integrate_mcp_servers(
        &self,
        mcp_config: &McpConfig,
        toolbox: &mut ResolvedToolbox,
    ) -> Result<(), ToolboxError> {
        // Configure MCP servers alongside local tools
    }
}

pub struct McpServerConfig {
    pub name: String,
    pub endpoint: String,
    pub auth_config: Option<AuthConfig>,
    pub capabilities: Vec<McpCapability>,
}
```

---

## 3. Feature Integration

### 3.1 Slash Commands (Conductor.build Inspired)

```rust
pub struct SlashCommandProcessor {
    pub commands: HashMap<String, SlashCommand>,
    pub custom_commands: Vec<CustomCommand>,
}

#[derive(Debug, Clone)]
pub struct SlashCommand {
    pub name: String,
    pub description: String,
    pub template: String,
    pub parameters: Vec<Parameter>,
}

// Built-in slash commands
impl Default for SlashCommandProcessor {
    fn default() -> Self {
        let mut commands = HashMap::new();
        
        commands.insert("/benchmark".to_string(), SlashCommand {
            name: "benchmark".to_string(),
            description: "Run evaluation benchmark".to_string(),
            template: "Run benchmark evaluation: {benchmark_name} with {agent_config}".to_string(),
            parameters: vec![
                Parameter::required("benchmark_name"),
                Parameter::optional("agent_config"),
            ],
        });
        
        commands.insert("/batch".to_string(), SlashCommand {
            name: "batch".to_string(),
            description: "Execute batch operations".to_string(),
            template: "Execute batch: {batch_config} across {repositories}".to_string(),
            parameters: vec![
                Parameter::required("batch_config"),
                Parameter::required("repositories"),
            ],
        });
        
        // Additional commands: /worktree, /agent-mode, /toolbox, /mcp
        
        Self { commands, custom_commands: vec![] }
    }
}
```

### 3.2 Evaluation Framework

Comprehensive framework combining both repositories:

```rust
pub struct EvaluationFramework {
    pub benchmark_registry: BenchmarkRegistry,
    pub dataset_manager: DatasetManager,
    pub metrics_collector: MetricsCollector,
    pub report_generator: ReportGenerator,
}

pub struct BenchmarkRegistry {
    pub swe_bench: SweBenchAdapter,
    pub custom_benchmarks: HashMap<String, CustomBenchmark>,
}

pub struct EvaluationConfig {
    pub name: String,
    pub agents: Vec<AgentConfig>,
    pub tasks: Vec<EvaluationTask>,
    pub metrics: MetricsConfig,
    pub parallel_limit: usize,
    pub timeout: Duration,
}

pub struct EvaluationResults {
    pub benchmark_id: String,
    pub timestamp: DateTime<Utc>,
    pub agent_results: HashMap<AgentId, AgentResults>,
    pub aggregate_metrics: AggregateMetrics,
    pub detailed_traces: Vec<ExecutionTrace>,
}
```

### 3.3 Real-time Monitoring

Crystal-inspired real-time updates:

```rust
pub struct MonitoringSystem {
    pub event_bus: EventBus,
    pub metrics_stream: MetricsStream,
    pub notification_system: NotificationSystem,
}

#[derive(Debug, Clone)]
pub enum OrchestratorEvent {
    SessionCreated { session_id: SessionId },
    SessionStatusChanged { session_id: SessionId, status: SessionStatus },
    BatchStarted { batch_id: BatchId, session_count: usize },
    BatchProgress { batch_id: BatchId, completed: usize, total: usize },
    EvaluationCompleted { eval_id: String, results: EvaluationSummary },
    ToolboxResolved { session_id: SessionId, tool_count: usize },
    AgentModeChanged { session_id: SessionId, mode: AgentMode },
}
```

---

## 4. Migration Strategy

### Phase 1: Core Infrastructure

1. **Unify Rust Backend**
   - Extract runtime environment, toolbox resolver from existing amp-orchestra
   - Port session management, worktree operations from amp-orchestrator to Rust
   - Implement unified data models and Tauri command handlers

2. **Frontend Integration**
   - Extend existing React frontend with amp-orchestrator features
   - Implement in-process Rust function calls via Tauri commands
   - Maintain zero external dependencies

3. **Testing Foundation**
   - Comprehensive unit tests for all core components
   - Integration tests with fake Amp CLI
   - CI/CD pipeline for single Tauri application

### Phase 2: Feature Integration

1. **Batch Processing & Evaluation**
   - Port batch runner with enhanced parallel execution
   - Integrate SWE-bench and custom benchmark frameworks
   - Implement comprehensive metrics collection

2. **Advanced Agent Capabilities**
   - Full agent mode switching with production/development gating
   - MCP server integration with toolbox system
   - Slash command processing framework

3. **Monitoring & Observability**
   - Real-time event streaming
   - Advanced metrics dashboard
   - Export capabilities for multiple formats

### Phase 3: Optimization & Production

1. **Performance Optimization**
   - Resource management for parallel sessions
   - Efficient worktree cleanup and management
   - Memory optimization for large-scale evaluations

2. **Native Platform Features**
   - Tauri-specific optimizations and native integrations
   - Auto-updater implementation
   - Cross-platform installer generation

3. **Production Readiness**
   - Security audit and hardening
   - Comprehensive documentation
   - Release preparation and rollout strategy

---

## 5. Component-by-Component Migration Plan

### Migration Strategy: Direct Implementation

Rather than using a bridge, migrate each component directly from amp-orchestrator's Node.js implementation to native Rust in amp-orchestra. Each component migration includes comprehensive testing to prevent regressions.

### Component Migration Order

**Priority 1: Foundation Components**
1. Git Worktree Manager (critical for isolation)
2. Enhanced Session Manager (extends existing)
3. Database Schema Extensions (supports all features)

**Priority 2: Execution Components** 
4. Batch Processing Engine (parallel execution)
5. Metrics Collection System (comprehensive telemetry)
6. Agent Dispatcher (multi-session coordination)

**Priority 3: Evaluation Components**
7. Benchmark Framework (evaluation harness)
8. Report Generation (metrics analysis)
9. Dataset Management (test case handling)

---

### Component 1: Git Worktree Manager

#### Migration Requirements

**From amp-orchestrator**: `packages/core/src/git/worktree-manager.ts`
```typescript
export class WorktreeManager {
  async createWorktree(sessionId: string, baseBranch: string): Promise<string>
  async removeWorktree(sessionId: string): Promise<void>
  async listActiveWorktrees(): Promise<WorktreeInfo[]>
  async cleanupOrphanedWorktrees(): Promise<void>
}
```

**To amp-orchestra**: `desktop-ui/src-tauri/src/worktree_manager.rs`
```rust
pub struct WorktreeManager {
    repo_root: PathBuf,
    worktrees_dir: PathBuf,
    database: Arc<Database>,
}

impl WorktreeManager {
    pub async fn create_worktree(
        &self,
        session_id: &str,
        base_branch: &str,
        branch_name: &str,
    ) -> Result<WorktreeInfo, WorktreeError>
    
    pub async fn remove_worktree(&self, session_id: &str) -> Result<(), WorktreeError>
    
    pub async fn list_active_worktrees(&self) -> Result<Vec<WorktreeInfo>, WorktreeError>
    
    pub async fn cleanup_orphaned_worktrees(&self) -> Result<Vec<String>, WorktreeError>
}
```

#### Database Schema Extension

```sql
-- Migration 005: Add worktree support
CREATE TABLE worktrees (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    repo_root TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_accessed TEXT,
    cleanup_scheduled BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
);

CREATE INDEX idx_worktrees_session ON worktrees(session_id);
CREATE INDEX idx_worktrees_cleanup ON worktrees(cleanup_scheduled);
```

#### Testing Requirements

**Unit Tests** (`src-tauri/src/worktree_manager/tests.rs`)
```rust
#[tokio::test]
async fn test_create_worktree_success() {
    // Verify worktree creation with valid inputs
    // Assert worktree directory exists
    // Assert Git branch created correctly
    // Assert database record inserted
}

#[tokio::test]
async fn test_create_worktree_duplicate_session() {
    // Attempt to create worktree for existing session
    // Assert appropriate error returned
    // Assert no duplicate database records
}

#[tokio::test] 
async fn test_remove_worktree_cleanup() {
    // Create worktree, then remove it
    // Assert worktree directory deleted
    // Assert Git branch cleaned up
    // Assert database record updated
}

#[tokio::test]
async fn test_orphaned_worktree_cleanup() {
    // Create orphaned worktree (no session record)
    // Run cleanup
    // Assert orphaned worktree removed
    // Assert valid worktrees preserved
}
```

**Integration Tests** (`src-tauri/src/integration_tests/worktree_tests.rs`)
```rust
#[tokio::test]
async fn test_worktree_session_lifecycle() {
    // Create session with worktree
    // Start iteration in worktree
    // Make changes and commit
    // Verify isolation from main branch
    // Cleanup and verify complete removal
}

#[tokio::test]
async fn test_concurrent_worktree_operations() {
    // Create multiple worktrees simultaneously
    // Verify no resource conflicts
    // Verify each worktree isolated correctly
}
```

**Tauri Command Integration**
```rust
#[tauri::command]
pub async fn create_worktree(
    session_id: String,
    base_branch: String,
    state: State<'_, AppState>,
) -> Result<WorktreeInfo, String> {
    state.worktree_manager
        .create_worktree(&session_id, &base_branch, &generate_branch_name())
        .await
        .map_err(|e| e.to_string())
}
```

#### Acceptance Criteria
- [ ] All unit tests pass with 100% code coverage
- [ ] Integration tests demonstrate complete isolation
- [ ] Concurrent operations handle race conditions correctly
- [ ] Error handling covers all Git failure modes
- [ ] Database consistency maintained under all conditions
- [ ] Performance matches or exceeds Node.js implementation

---

### Component 2: Enhanced Session Manager

#### Migration Requirements

**Extend existing amp-orchestra session manager** with amp-orchestrator features:

**Current**: `desktop-ui/src-tauri/src/session_commands.rs` (basic session creation)
**Enhanced**: Full lifecycle management with worktree integration

```rust
pub struct EnhancedSessionManager {
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    worktree_manager: Arc<WorktreeManager>,
    metrics_collector: Arc<MetricsCollector>,
    database: Arc<Database>,
}

impl EnhancedSessionManager {
    pub async fn create_session_with_worktree(
        &self,
        config: SessionConfig,
    ) -> Result<Session, SessionError>
    
    pub async fn start_iteration_isolated(
        &self,
        session_id: &str,
    ) -> Result<IterationHandle, SessionError>
    
    pub async fn commit_iteration(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<CommitInfo, SessionError>
    
    pub async fn squash_and_merge(
        &self,
        session_id: &str,
        target_branch: &str,
    ) -> Result<MergeResult, SessionError>
}
```

#### Testing Requirements

**Unit Tests**
```rust
#[tokio::test]
async fn test_session_worktree_integration() {
    // Create session with worktree
    // Verify session record includes worktree info
    // Verify worktree created correctly
    // Verify session status tracking
}

#[tokio::test]
async fn test_iteration_isolation() {
    // Start iteration in worktree
    // Make changes in worktree
    // Verify main branch unaffected
    // Verify changes tracked in session
}

#[tokio::test]
async fn test_commit_and_squash() {
    // Create multiple commits in session
    // Perform squash operation
    // Verify single commit result
    // Verify commit message format
}
```

**Integration Tests**
```rust
#[tokio::test]
async fn test_complete_session_lifecycle() {
    // Create session with worktree
    // Run multiple iterations
    // Commit changes with proper messages
    // Squash commits and merge to main
    // Cleanup and verify state
}
```

#### Acceptance Criteria
- [ ] All existing session functionality preserved
- [ ] Worktree integration seamless and automatic
- [ ] Iteration isolation verified through tests
- [ ] Commit and squash operations maintain Git best practices
- [ ] Error recovery handles partial states correctly
- [ ] Performance impact minimal compared to current implementation

---

### Component 3: Batch Processing Engine

#### Migration Requirements

**From amp-orchestrator**: `packages/core/src/batch/batch-runner.ts`
```typescript
export class BatchRunner {
  async executeBatch(config: BatchConfig): Promise<BatchResult[]>
  async monitorProgress(): AsyncGenerator<BatchProgress>
  cancelBatch(batchId: string): Promise<void>
}
```

**To amp-orchestra**: `desktop-ui/src-tauri/src/batch_engine.rs`
```rust
pub struct BatchEngine {
    session_manager: Arc<EnhancedSessionManager>,
    concurrency_limit: usize,
    active_batches: Arc<RwLock<HashMap<String, BatchExecution>>>,
}

impl BatchEngine {
    pub async fn start_batch(
        &self,
        config: BatchConfig,
    ) -> Result<BatchHandle, BatchError>
    
    pub fn monitor_progress(
        &self,
        batch_id: &str,
    ) -> impl Stream<Item = BatchProgress>
    
    pub async fn cancel_batch(&self, batch_id: &str) -> Result<(), BatchError>
}
```

#### Database Schema Extension

```sql
-- Migration 006: Add batch processing support
CREATE TABLE batch_runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    total_sessions INTEGER NOT NULL,
    completed_sessions INTEGER DEFAULT 0,
    failed_sessions INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE batch_sessions (
    batch_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    metrics_json TEXT,
    PRIMARY KEY (batch_id, session_id),
    FOREIGN KEY (batch_id) REFERENCES batch_runs (id),
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
);
```

#### Testing Requirements

**Unit Tests**
```rust
#[tokio::test]
async fn test_batch_execution_sequential() {
    // Create batch with 3 sessions
    // Execute sequentially (concurrency = 1)
    // Verify execution order
    // Verify all sessions complete successfully
}

#[tokio::test]
async fn test_batch_execution_parallel() {
    // Create batch with 6 sessions
    // Execute with concurrency = 3
    // Verify parallel execution
    // Verify resource management
}

#[tokio::test]
async fn test_batch_cancellation() {
    // Start batch execution
    // Cancel mid-execution
    // Verify running sessions stopped
    // Verify cleanup completed
}

#[tokio::test]
async fn test_batch_error_handling() {
    // Create batch with failing session
    // Verify error captured correctly
    // Verify other sessions continue
    // Verify final batch status accurate
}
```

**Integration Tests**
```rust
#[tokio::test]
async fn test_batch_with_real_amp_cli() {
    // Create batch with actual Amp CLI calls
    // Verify end-to-end execution
    // Verify metrics collection
    // Verify worktree isolation maintained
}
```

#### Acceptance Criteria
- [ ] Parallel execution respects concurrency limits
- [ ] Progress monitoring provides real-time updates
- [ ] Cancellation stops all running sessions cleanly
- [ ] Error handling isolates failures to individual sessions
- [ ] Resource usage stays within acceptable bounds
- [ ] Database consistency maintained throughout execution

---

### Testing Framework

#### Regression Testing Strategy

**Test Categories:**

1. **Smoke Tests**: Basic functionality works
2. **Parity Tests**: Behavior matches amp-orchestrator
3. **Integration Tests**: Components work together correctly
4. **Performance Tests**: Performance meets requirements
5. **Stress Tests**: System handles edge cases

**Test Execution Pipeline:**

```bash
# Run before any migration work
cargo test --workspace --verbose                 # All existing tests pass
cargo test integration --verbose                # Integration tests pass
pnpm test                                       # Frontend tests pass

# Run during migration (per component)
cargo test worktree_manager --verbose          # Component unit tests
cargo test integration::worktree --verbose     # Component integration tests
cargo test --workspace --verbose               # No regressions introduced

# Run after migration complete
cargo test --workspace --verbose               # Full test suite
pnpm test                                      # Frontend tests
./scripts/e2e-test.sh                         # End-to-end validation
./scripts/performance-benchmark.sh             # Performance comparison
```

#### Functional Testing Checklist

**For Each Component Migration:**

**Pre-Migration:**
- [ ] Document current behavior in amp-orchestrator
- [ ] Create comprehensive test cases covering all scenarios
- [ ] Establish performance baseline measurements
- [ ] Identify all integration points with other components

**During Migration:**
- [ ] Implement component with full unit test coverage
- [ ] Verify integration tests pass
- [ ] Run full regression test suite
- [ ] Compare performance against baseline
- [ ] Document any behavioral changes or improvements

**Post-Migration:**
- [ ] All tests pass consistently
- [ ] Performance meets or exceeds baseline
- [ ] Integration points function correctly
- [ ] Error handling covers all edge cases
- [ ] Memory usage remains stable under load

#### End-to-End Validation

**Complete Workflow Tests:**
```bash
# Test 1: Basic session with worktree
./scripts/test-session-worktree.sh

# Test 2: Batch execution with multiple sessions  
./scripts/test-batch-execution.sh

# Test 3: Evaluation framework with benchmark
./scripts/test-evaluation-benchmark.sh

# Test 4: Complete migration parity check
./scripts/test-amp-orchestrator-parity.sh
```

**Success Criteria for Complete Migration:**
- [ ] All amp-orchestrator features implemented in amp-orchestra
- [ ] Performance equal or better than original implementation
- [ ] Zero regressions in existing amp-orchestra functionality  
- [ ] Database migrations complete successfully
- [ ] All integration tests pass
- [ ] End-to-end workflows function identically
- [ ] Memory usage and resource consumption acceptable
- [ ] Cross-platform compatibility maintained

---

## 5. Technical Specifications

### 5.1 Configuration Schema

```rust
pub struct OrchestratorConfig {
    pub core: CoreConfig,
    pub ui: UiConfig,
    pub git: GitConfig,
    pub amp: AmpConfig,
    pub evaluation: EvaluationConfig,
    pub security: SecurityConfig,
}

pub struct CoreConfig {
    pub database_path: PathBuf,
    pub worktrees_root: PathBuf,
    pub runtime_toolboxes_root: PathBuf,
    pub max_concurrent_sessions: usize,
    pub session_timeout: Duration,
}

pub struct GitConfig {
    pub default_base_branch: String,
    pub commit_prefix: String, // "amp:"
    pub auto_cleanup_worktrees: bool,
    pub worktree_gc_interval: Duration,
}
```

### 5.2 API Specification (Tauri Commands)

```rust
// Tauri command handlers for frontend-backend communication
#[tauri::command]
pub async fn create_session(
    config: CreateSessionConfig,
    state: tauri::State<'_, AppState>,
) -> Result<SessionResponse, String> { /* ... */ }

#[tauri::command]
pub async fn list_sessions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SessionInfo>, String> { /* ... */ }

#[tauri::command]
pub async fn start_iteration(
    session_id: SessionId,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> { /* ... */ }

#[tauri::command]
pub async fn start_batch(
    batch_config: BatchConfig,
    state: tauri::State<'_, AppState>,
) -> Result<BatchResponse, String> { /* ... */ }

#[tauri::command]
pub async fn run_benchmark(
    benchmark_config: BenchmarkConfig,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> { /* ... */ }

// Event system for real-time updates
pub fn setup_event_handlers(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Setup event listeners for streaming updates
}
```

### 5.3 Security Model

```rust
pub struct SecurityConfig {
    pub toolbox_constraints: ToolboxConstraints,
    pub process_limits: ProcessLimits,
    pub network_policy: NetworkPolicy,
    pub data_protection: DataProtectionConfig,
}

pub struct ToolboxConstraints {
    pub max_file_size: u64,        // 10MB default
    pub max_total_size: u64,       // 100MB default
    pub max_file_count: usize,     // 1000 files default
    pub allowed_extensions: Vec<String>,
    pub forbidden_paths: Vec<PathBuf>,
    pub execution_timeout: Duration,
}

pub struct ProcessLimits {
    pub max_memory_mb: u64,        // 2GB default
    pub max_cpu_percent: f32,      // 80% default
    pub max_execution_time: Duration,
    pub max_open_files: usize,
    pub sandbox_mode: bool,
}
```

---

## 6. Success Criteria

### 6.1 Functional Requirements

- ✅ **Parallel Session Management**: Support 8+ concurrent isolated sessions
- ✅ **Comprehensive Evaluation**: SWE-bench, custom benchmarks, batch processing  
- ✅ **Multi-Environment Support**: Production, local development, CI environments
- ✅ **Advanced Tooling**: Agent modes, custom toolboxes, MCP integration
- ✅ **Real-time Monitoring**: Live metrics, progress tracking, notifications

### 6.2 Performance Requirements

- **Startup Time**: < 2 seconds for Tauri application launch
- **Session Creation**: < 1 second for worktree setup (in-process Rust calls)
- **Concurrent Sessions**: 8+ parallel sessions without degradation
- **Memory Usage**: < 512MB total for desktop application
- **Batch Processing**: Process 100+ evaluation tasks efficiently
- **Installer Size**: < 50MB cross-platform installer

### 6.3 Quality Requirements

- **Test Coverage**: > 90% for core components
- **Documentation**: Comprehensive API and user documentation
- **Cross-platform**: Windows, macOS, Linux support
- **Security**: Comprehensive sandboxing and constraint enforcement
- **Reliability**: Graceful error handling and recovery

---

## 7. Conclusion

This unified design specification provides a comprehensive roadmap for consolidating amp-orchestra and amp-orchestrator into a single, lightweight Tauri-based AI development orchestration platform. By combining the strengths of both systems and incorporating proven patterns from Conductor.build and Crystal, we create a robust foundation for advanced AI-assisted development workflows.

The single-application approach eliminates complexity while maximizing performance through native Rust integration. The ~40MB installer with zero external dependencies provides an exceptional developer experience compared to traditional Electron-based solutions.

This architecture positions Amp Orchestra as a leading platform for AI development orchestration, delivering comprehensive evaluation capabilities, advanced parallel processing, and extensible tooling frameworks in a single, performant desktop application.
