# Step 1: Comprehensive Migration Analysis & Strategy

**Status**: Completed  
**Date**: 2025-01-08  
**Objective**: Analyze and inventory both amp-orchestra and amp-orchestrator codebases to create a detailed migration strategy

---

## Executive Summary

Based on comprehensive analysis by the Oracle and specialized subagents, here's the strategic approach for consolidating both codebases into a single Tauri application:

### Key Finding: Strong Foundation Exists
- **amp-orchestra provides ~70% of the foundation** with modern Tauri/Rust backend and React frontend
- **amp-orchestrator contains critical missing features**: Git worktree management, batch processing, evaluation framework
- **Migration complexity**: Moderate to Complex depending on component

### Recommended Strategy: Phased Integration (Not Rewrite)
Rather than a big-bang rewrite, use a **"Bring the brain over"** approach with gradual Rust migration.

---

## 1. Current State Analysis

### amp-orchestra (Modern Tauri Foundation) ✅ **70% Complete**

**Strengths - Already Production Ready:**
- Authentication & profile management (fully implemented)
- Modern React UI with comprehensive component library  
- Tauri backend with 60+ command handlers
- Terminal/PTY integration with sophisticated TUI framework
- Toolbox system with advanced resolver and profiles
- Runtime environment management
- Cross-platform testing infrastructure

**Critical Gaps for Full Functionality:**
- 🔴 Git worktree isolation system (missing entirely)
- 🔴 Batch execution engine (no parallel processing)
- 🔴 Evaluation/benchmark framework (no testing harness)
- 🔴 Agent dispatcher (no multi-agent coordination)

### amp-orchestrator (Mature Node.js Implementation) ✅ **100% Feature Complete**

**Critical Components to Migrate:**
- **Session Management**: [`packages/core/src/session/`] - Complete lifecycle management
- **Git Worktree Operations**: [`packages/core/src/git/`] - Isolation via worktrees  
- **Batch Processing Engine**: [`packages/core/src/batch/`] - Parallel execution framework
- **Evaluation Framework**: [`packages/core/src/benchmark/`] - SWE-bench integration
- **Metrics Collection**: [`packages/core/src/metrics/`] - Comprehensive telemetry
- **CLI Commands**: [`packages/cli/src/commands/`] - Battle-tested command implementations

---

## 2. Strategic Migration Plan

### Phase A: "Bring the Brain Over" (Weeks 1-2)

**Objective**: Get all amp-orchestrator functionality running in Tauri with zero feature loss

1. **Create Legacy Package**
   ```bash
   # Inside amp-orchestra
   mkdir packages/amp-core-legacy
   # Copy from amp-orchestrator:
   cp -r ../amp-orchestrator/packages/core/src packages/amp-core-legacy/
   cp -r ../amp-orchestrator/packages/cli/src packages/amp-core-legacy/cli/
   ```

2. **Node Bridge Integration**  
   - Use Tauri plugin or custom wrapper to run Node.js sidecar
   - Implement JSON-RPC bridge between Rust and Node legacy code
   - Create Rust wrapper commands that call legacy Node functions

3. **React UI Extension**
   - Add missing UI components for batch processing and evaluation
   - Integrate with existing Tauri command system
   - Preserve all existing functionality

### Phase B: "Gradual Rust Migration" (Ongoing)

**Priority Order for Rust Conversion:**
1. **Git Worktree Operations** → Use `git2` crate (highest performance impact)
2. **Metrics Collection** → Use `serde_json` and `sqlite` (clean data layer)
3. **Session Management** → Integrate with existing Tauri session system
4. **Batch Processing** → Keep orchestration in Rust, delegate execution to processes
5. **Evaluation Framework** → Port gradually while maintaining Node script compatibility

---

## 3. Component-by-Component Migration Map

### 3.1 Session Management
**From amp-orchestrator**: [`packages/core/src/session/`]
```typescript
// Current Node.js patterns
class SessionManager {
  async createSession(config: SessionConfig): Promise<Session>
  async startIteration(sessionId: string): Promise<void>
  async stopSession(sessionId: string): Promise<void>
}
```

**To amp-orchestra**: [`desktop-ui/src-tauri/src/session_manager.rs`]
```rust
// Target Rust implementation
impl SessionManager {
    pub async fn create_session(&self, config: CreateSessionConfig) -> Result<Session, Error>
    pub async fn start_iteration(&self, session_id: &str) -> Result<(), Error>
    pub async fn stop_session(&self, session_id: &str) -> Result<(), Error>
}
```

**Migration Complexity**: **Moderate**
- Existing Tauri session infrastructure can be extended
- Event system needs bridging from Node EventEmitter to Tauri events
- Database schema requires extension for worktree and batch support

### 3.2 Git Worktree Operations  
**From amp-orchestrator**: [`packages/core/src/git/`]
```typescript
class GitWorktreeManager {
  async createWorktree(sessionId: string, baseBranch: string): Promise<string>
  async cleanupWorktree(sessionId: string): Promise<void>
  async listWorktrees(): Promise<WorktreeInfo[]>
}
```

**To amp-orchestra**: [`desktop-ui/src-tauri/src/worktree_manager.rs`]
```rust
impl WorktreeManager {
    pub async fn create_worktree(&self, session_id: &str, base_branch: &str) -> Result<PathBuf, Error>
    pub async fn cleanup_worktree(&self, session_id: &str) -> Result<(), Error>
    pub async fn list_worktrees(&self) -> Result<Vec<WorktreeInfo>, Error>
}
```

**Migration Complexity**: **Moderate to Complex**
- Currently missing from amp-orchestra (needs full implementation)
- Can use `git2` crate for better performance than Node `simple-git`
- Critical for session isolation - highest priority for migration

### 3.3 Batch Processing Engine
**From amp-orchestrator**: [`packages/core/src/batch/`]
```typescript
class BatchRunner {
  async runBatch(config: BatchConfig): Promise<BatchResult[]>
  async monitorProgress(): AsyncIterator<BatchProgress>
  async cancelBatch(batchId: string): Promise<void>
}
```

**To amp-orchestra**: [`desktop-ui/src-tauri/src/batch_runner.rs`]
```rust
impl BatchRunner {
    pub async fn run_batch(&self, config: BatchConfig) -> Result<Vec<BatchResult>, Error>
    pub fn monitor_progress(&self) -> impl Stream<Item = BatchProgress>
    pub async fn cancel_batch(&self, batch_id: &str) -> Result<(), Error>
}
```

**Migration Complexity**: **Complex**
- No current implementation in amp-orchestra
- Requires parallel execution framework with proper resource management
- Needs integration with existing session management system

### 3.4 Evaluation Framework
**From amp-orchestrator**: [`packages/core/src/benchmark/`]
```typescript
class EvaluationFramework {
  async runBenchmark(config: BenchmarkConfig): Promise<EvaluationResults>
  async loadDataset(dataset: string): Promise<TestCase[]>
  async generateReport(results: EvaluationResults): Promise<Report>
}
```

**To amp-orchestra**: [`desktop-ui/src-tauri/src/evaluation.rs`]
```rust
impl EvaluationFramework {
    pub async fn run_benchmark(&self, config: BenchmarkConfig) -> Result<EvaluationResults, Error>
    pub async fn load_dataset(&self, dataset: &str) -> Result<Vec<TestCase>, Error>
    pub async fn generate_report(&self, results: EvaluationResults) -> Result<Report, Error>
}
```

**Migration Complexity**: **Complex**
- Comprehensive framework with SWE-bench integration
- Requires dataset management and result analysis
- Can leverage existing batch processing infrastructure

---

## 4. Database Schema Extensions

### Current amp-orchestra Schema
```sql
-- Existing tables (4 migrations)
profiles, ui_state, chat_sessions, toolbox_profiles
```

### Required Extensions for amp-orchestrator Parity
```sql
-- Additional tables needed
CREATE TABLE worktrees (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    repo_root TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cleaned_up_at TEXT,
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
);

CREATE TABLE batch_runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE batch_sessions (
    batch_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    result_json TEXT,
    PRIMARY KEY (batch_id, session_id),
    FOREIGN KEY (batch_id) REFERENCES batch_runs (id),
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
);

CREATE TABLE evaluation_runs (
    id TEXT PRIMARY KEY,
    benchmark_name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    results_json TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE metrics (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    iteration_id TEXT,
    metric_type TEXT NOT NULL,
    value_json TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
);
```

---

## 5. UI Component Extensions

### Missing Components for amp-orchestrator Parity

1. **Batch Dashboard** (`desktop-ui/src/components/batch/`)
   - BatchList.tsx - List all batch runs
   - BatchRunner.tsx - Execute and monitor batches
   - BatchResults.tsx - View batch execution results
   - BatchConfig.tsx - Configure batch parameters

2. **Benchmark Dashboard** (`desktop-ui/src/components/benchmark/`)
   - BenchmarkList.tsx - Available benchmarks
   - BenchmarkRunner.tsx - Execute evaluations  
   - BenchmarkResults.tsx - View evaluation results
   - BenchmarkReports.tsx - Generate and export reports

3. **Worktree Manager** (`desktop-ui/src/components/worktree/`)
   - WorktreeList.tsx - Active worktrees
   - WorktreeViewer.tsx - Browse worktree contents
   - WorktreeCleanup.tsx - Cleanup and maintenance

4. **Session Enhancement** (`desktop-ui/src/components/session/`)
   - SessionBatchView.tsx - Session batch operations
   - SessionMetrics.tsx - Enhanced metrics display
   - SessionWorktree.tsx - Worktree integration

---

## 6. Integration Points

### Existing Systems to Leverage ✅

1. **Authentication System** - Fully compatible, no changes needed
2. **Profile Management** - Can be extended with batch/evaluation profiles  
3. **Terminal Integration** - Perfect for streaming batch/evaluation output
4. **Theme System** - All new components inherit existing theming
5. **Testing Infrastructure** - Can be extended for new functionality

### New Integration Required 🔄

1. **Event System** - Extend Tauri events for batch/evaluation progress
2. **Command Handlers** - Add IPC commands for worktree/batch/evaluation
3. **Database Queries** - Extend existing SQLite operations
4. **Configuration** - Add batch/evaluation configuration options

---

## 7. Risk Assessment & Mitigation

### High Risk Areas
1. **Git Worktree Operations** - Core isolation mechanism
   - **Mitigation**: Implement comprehensive test suite, use proven patterns from amp-orchestrator
   
2. **Batch Execution Resource Management** - Potential memory/CPU exhaustion
   - **Mitigation**: Implement proper concurrency limits, resource monitoring

3. **Data Migration** - Existing amp-orchestrator users
   - **Mitigation**: Provide migration tools, maintain backward compatibility

### Medium Risk Areas
1. **Node.js Bridge Complexity** - Temporary architectural complexity
   - **Mitigation**: Clear migration timeline, comprehensive documentation

2. **UI Component Integration** - New components must match existing design
   - **Mitigation**: Use existing component library, follow established patterns

---

## 8. Success Metrics

### Phase A Completion Criteria
- [ ] All amp-orchestrator features accessible in Tauri app
- [ ] Feature parity testing passes 100%
- [ ] Performance within 10% of native Node.js implementation
- [ ] Cross-platform installer size < 100MB (including Node sidecar)

### Phase B Completion Criteria  
- [ ] Each legacy component replaced with Rust implementation
- [ ] Performance improvements documented
- [ ] Legacy Node.js code completely removed
- [ ] Final installer size < 50MB

---

## 9. Next Actions

### Immediate (This Week)
1. **Create `packages/amp-core-legacy`** - Copy critical components from amp-orchestrator
2. **Implement Node.js Bridge** - Basic JSON-RPC communication
3. **Extend Database Schema** - Add required tables for worktree/batch support
4. **Create Missing UI Components** - Basic versions of batch/evaluation interfaces

### Short Term (Next 2-3 Weeks)
1. **Full Feature Parity Testing** - Comprehensive test suite comparing both applications
2. **Performance Benchmarking** - Measure and optimize bridge performance
3. **User Experience Testing** - Ensure seamless transition for existing users
4. **Documentation** - Migration guide and architecture documentation

### Long Term (Ongoing)
1. **Rust Migration Sprints** - One component per sprint, starting with Git worktree operations
2. **Performance Optimization** - Continuous improvement as components move to Rust
3. **Feature Enhancement** - New capabilities beyond amp-orchestrator functionality

---

**This completes Step 1 of the unified design plan. The analysis shows a clear path forward with manageable complexity and strong existing foundation to build upon.**
