use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// Type aliases for better readability
pub type SessionId = String;
pub type BatchId = String;
pub type BenchmarkId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    Initializing,
    Idle,
    Running,
    AwaitingInput,
    Evaluating,
    Error(String),
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentMode {
    Default,
    Geppetto,
    Claudetto,
    GronkFast,
    Bolt,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub endpoint: String,
    pub auth_config: Option<AuthConfig>,
    pub capabilities: Vec<McpCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub auth_type: String,
    pub credentials: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum McpCapability {
    Tools,
    Resources,
    Prompts,
    Logging,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub environment_variables: HashMap<String, String>,
    pub process_limits: ProcessLimits,
    pub toolbox_config: Option<ToolboxConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessLimits {
    pub max_memory_mb: u64,
    pub max_cpu_percent: f32,
    pub max_execution_time: Duration,
    pub max_open_files: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolboxConfig {
    pub toolbox_paths: Vec<PathBuf>,
    pub security_constraints: SecurityConstraints,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConstraints {
    pub max_file_size: u64,
    pub max_total_size: u64,
    pub max_file_count: usize,
    pub allowed_extensions: Vec<String>,
    pub forbidden_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkConfig {
    pub benchmark_id: BenchmarkId,
    pub name: String,
    pub dataset_path: Option<PathBuf>,
    pub script_command: Option<String>,
    pub evaluation_criteria: Vec<EvaluationCriterion>,
    pub timeout: Duration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationCriterion {
    pub name: String,
    pub weight: f64,
    pub metric_type: MetricType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MetricType {
    SuccessRate,
    ExecutionTime,
    TokenUsage,
    CostAnalysis,
    ToolUsageStats,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsCollector {
    pub session_id: SessionId,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub iterations: u32,
    pub tokens_used: u64,
    pub cost: f64,
    pub tools_used: HashMap<String, u32>,
    pub custom_metrics: HashMap<String, serde_json::Value>,
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self {
            session_id: String::new(),
            start_time: None,
            end_time: None,
            iterations: 0,
            tokens_used: 0,
            cost: 0.0,
            tools_used: HashMap::new(),
            custom_metrics: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub session_id: SessionId,
    pub worktree_path: PathBuf,
    pub branch_name: String,
    pub base_branch: String,
    pub created_at: DateTime<Utc>,
    pub is_active: bool,
    pub commit_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Batch {
    pub id: BatchId,
    pub name: String,
    pub description: Option<String>,
    pub config: BatchConfig,
    pub status: BatchStatus,
    pub sessions: Vec<SessionId>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub metrics: BatchMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BatchStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchConfig {
    pub concurrency_limit: usize,
    pub timeout: Duration,
    pub retry_policy: RetryPolicy,
    pub environment: EnvironmentConfig,
    pub tasks: Vec<BatchTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub backoff_ms: u64,
    pub retry_on_failure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentConfig {
    pub amp_server_url: Option<String>,
    pub amp_cli_path: Option<PathBuf>,
    pub agent_modes: Vec<AgentMode>,
    pub toolbox_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchTask {
    pub id: String,
    pub task_type: TaskType,
    pub prompt: String,
    pub repository: Option<PathBuf>,
    pub agent_config: Option<AgentConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    Evaluation,
    Batch,
    Benchmark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub agent_mode: AgentMode,
    pub model_override: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchMetrics {
    pub total_sessions: usize,
    pub completed_sessions: usize,
    pub failed_sessions: usize,
    pub average_execution_time: Option<Duration>,
    pub total_tokens_used: u64,
    pub total_cost: f64,
}

impl Default for BatchMetrics {
    fn default() -> Self {
        Self {
            total_sessions: 0,
            completed_sessions: 0,
            failed_sessions: 0,
            average_execution_time: None,
            total_tokens_used: 0,
            total_cost: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Benchmark {
    pub id: BenchmarkId,
    pub name: String,
    pub description: Option<String>,
    pub benchmark_type: BenchmarkType,
    pub dataset_info: DatasetInfo,
    pub evaluation_config: EvaluationConfig,
    pub results: Vec<BenchmarkResult>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BenchmarkType {
    SweBench,
    Custom,
    Performance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetInfo {
    pub dataset_path: PathBuf,
    pub total_cases: usize,
    pub case_format: String,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationConfig {
    pub agents: Vec<AgentConfig>,
    pub parallel_limit: usize,
    pub timeout: Duration,
    pub metrics: Vec<MetricType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub agent_id: String,
    pub timestamp: DateTime<Utc>,
    pub success_rate: f64,
    pub average_iterations: f64,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub execution_time: Duration,
    pub detailed_results: Vec<CaseResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseResult {
    pub case_id: String,
    pub success: bool,
    pub iterations: u32,
    pub tokens_used: u64,
    pub execution_time: Duration,
    pub error_message: Option<String>,
}

// Helper functions for creating instances
impl Session {
    pub fn new(
        name: String,
        prompt: String,
        repo_root: PathBuf,
        base_branch: String,
    ) -> Self {
        let id = Uuid::new_v4().to_string();
        let branch_name = format!("amp-session-{}", &id[..8]);
        let worktree_path = repo_root.join(".worktrees").join(&id);
        
        Self {
            id,
            name,
            prompt,
            repo_root,
            base_branch,
            branch_name,
            worktree_path,
            status: SessionStatus::Initializing,
            agent_mode: None,
            toolbox_path: None,
            mcp_servers: Vec::new(),
            runtime_config: RuntimeConfig::default(),
            benchmark_config: None,
            batch_id: None,
            metrics: MetricsCollector::default(),
            created_at: Utc::now(),
            last_run: None,
            timeout: None,
        }
    }
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            environment_variables: HashMap::new(),
            process_limits: ProcessLimits::default(),
            toolbox_config: None,
        }
    }
}

impl Default for ProcessLimits {
    fn default() -> Self {
        Self {
            max_memory_mb: 2048,
            max_cpu_percent: 80.0,
            max_execution_time: Duration::from_secs(3600),
            max_open_files: 1000,
        }
    }
}

impl Batch {
    pub fn new(name: String, config: BatchConfig) -> Self {
        let id = Uuid::new_v4().to_string();
        
        Self {
            id,
            name,
            description: None,
            config,
            status: BatchStatus::Pending,
            sessions: Vec::new(),
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            metrics: BatchMetrics::default(),
        }
    }
}

impl Benchmark {
    pub fn new(name: String, benchmark_type: BenchmarkType) -> Self {
        let id = Uuid::new_v4().to_string();
        
        Self {
            id,
            name,
            description: None,
            benchmark_type,
            dataset_info: DatasetInfo {
                dataset_path: PathBuf::new(),
                total_cases: 0,
                case_format: "json".to_string(),
                metadata: HashMap::new(),
            },
            evaluation_config: EvaluationConfig {
                agents: Vec::new(),
                parallel_limit: 4,
                timeout: Duration::from_secs(3600),
                metrics: vec![MetricType::SuccessRate, MetricType::ExecutionTime],
            },
            results: Vec::new(),
            created_at: Utc::now(),
        }
    }
}
