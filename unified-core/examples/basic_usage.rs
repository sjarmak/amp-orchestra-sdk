use std::path::PathBuf;
use unified_core::*;

#[tokio::main]
async fn main() -> Result<()> {
    // Create a new session
    let session = Session::new(
        "Example Session".to_string(),
        "Implement a simple REST API with error handling".to_string(),
        PathBuf::from("/tmp/example-repo"),
        "main".to_string(),
    );

    println!("Created session: {}", session.name);
    println!("Session ID: {}", session.id);
    println!("Worktree path: {}", session.worktree_path.display());
    println!("Branch name: {}", session.branch_name);
    println!("Status: {:?}", session.status);

    // Create an in-memory store
    let store = InMemoryStore::new();

    // Store the session
    store.create_session(&session).await?;
    println!("\nSession stored successfully");

    // Retrieve the session
    let retrieved = store.get_session(&session.id).await?;
    if let Some(retrieved_session) = retrieved {
        println!("Retrieved session: {}", retrieved_session.name);
    }

    // Create a batch configuration
    let batch_config = BatchConfig {
        concurrency_limit: 4,
        timeout: std::time::Duration::from_secs(3600),
        retry_policy: RetryPolicy {
            max_attempts: 3,
            backoff_ms: 1000,
            retry_on_failure: true,
        },
        environment: EnvironmentConfig {
            amp_server_url: Some("https://ampcode.com".to_string()),
            amp_cli_path: None,
            agent_modes: vec![AgentMode::Default],
            toolbox_paths: vec![],
        },
        tasks: vec![
            BatchTask {
                id: "task-1".to_string(),
                task_type: TaskType::Evaluation,
                prompt: "Implement JWT authentication".to_string(),
                repository: Some(PathBuf::from("/tmp/auth-service")),
                agent_config: Some(AgentConfig {
                    agent_mode: AgentMode::Default,
                    model_override: Some("claude-3-5-sonnet".to_string()),
                    temperature: Some(0.7),
                    max_tokens: Some(4000),
                }),
            },
            BatchTask {
                id: "task-2".to_string(),
                task_type: TaskType::Evaluation,
                prompt: "Add comprehensive error handling".to_string(),
                repository: Some(PathBuf::from("/tmp/auth-service")),
                agent_config: Some(AgentConfig {
                    agent_mode: AgentMode::Geppetto,
                    model_override: Some("gpt-4".to_string()),
                    temperature: Some(0.3),
                    max_tokens: Some(3000),
                }),
            },
        ],
    };

    // Create a batch
    let batch = Batch::new("Authentication Service Batch".to_string(), batch_config);
    println!("\nCreated batch: {}", batch.name);
    println!("Batch ID: {}", batch.id);
    println!("Concurrency limit: {}", batch.config.concurrency_limit);
    println!("Number of tasks: {}", batch.config.tasks.len());

    // Store the batch
    store.create_batch(&batch).await?;
    println!("Batch stored successfully");

    // Create a Git backend using the factory function
    // For this example, we'll just create a dummy directory structure
    let repo_path = PathBuf::from("/tmp/example-repo");
    if !repo_path.exists() {
        std::fs::create_dir_all(&repo_path).ok();
        std::fs::create_dir_all(&repo_path.join(".git")).ok();
    }
    
    match create_git_backend(repo_path) {
        Ok(git_backend) => {
            git_backend.initialize().await?;
            println!("\nGit backend initialized");

            // Check if branches exist (this will fail for dummy repo, but shows the API)
            match git_backend.is_branch_existing("main").await {
                Ok(main_exists) => println!("Main branch exists: {}", main_exists),
                Err(e) => println!("Could not check main branch: {:?}", e),
            }

            // List worktrees
            match git_backend.list_worktrees().await {
                Ok(worktrees) => println!("Active worktrees: {}", worktrees.len()),
                Err(e) => println!("Could not list worktrees: {:?}", e),
            }
        }
        Err(e) => {
            println!("Could not create git backend (expected for dummy repo): {:?}", e);
        }
    }

    // Create a benchmark
    let benchmark = Benchmark::new("SWE-Bench Evaluation".to_string(), BenchmarkType::SweBench);
    println!("\nCreated benchmark: {}", benchmark.name);
    println!("Benchmark ID: {}", benchmark.id);
    println!("Benchmark type: {:?}", benchmark.benchmark_type);

    // Store the benchmark
    store.create_benchmark(&benchmark).await?;
    println!("Benchmark stored successfully");

    // List all stored entities
    let all_sessions = store.list_sessions().await?;
    let all_batches = store.list_batches().await?;
    let all_benchmarks = store.list_benchmarks().await?;

    println!("\n--- Summary ---");
    println!("Total sessions: {}", all_sessions.len());
    println!("Total batches: {}", all_batches.len());
    println!("Total benchmarks: {}", all_benchmarks.len());

    Ok(())
}
