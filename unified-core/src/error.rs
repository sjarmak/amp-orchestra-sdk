use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum UnifiedError {
    #[error("Session error: {0}")]
    Session(#[from] SessionError),
    
    #[error("Git error: {0}")]
    Git(#[from] GitError),
    
    #[error("Persistence error: {0}")]
    Persistence(#[from] PersistenceError),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Error, Debug)]
pub enum SessionError {
    #[error("Session not found: {id}")]
    NotFound { id: String },
    
    #[error("Session already exists: {id}")]
    AlreadyExists { id: String },
    
    #[error("Invalid session status: {status}")]
    InvalidStatus { status: String },
    
    #[error("Session timeout: {id}")]
    Timeout { id: String },
    
    #[error("Session creation failed: {reason}")]
    CreationFailed { reason: String },
}

#[derive(Error, Debug)]
pub enum GitError {
    #[error("Branch not found: {branch}")]
    BranchNotFound { branch: String },
    
    #[error("Branch already exists: {branch}")]
    BranchExists { branch: String },
    
    #[error("Worktree not found at path: {path}")]
    WorktreeNotFound { path: PathBuf },
    
    #[error("Worktree already exists at path: {path}")]
    WorktreeExists { path: PathBuf },
    
    #[error("Git repository not found at: {path}")]
    RepositoryNotFound { path: PathBuf },
    
    #[error("Git operation failed: {operation} - {reason}")]
    OperationFailed { operation: String, reason: String },
    
    #[error("Working directory not clean: {reason}")]
    DirtyWorkingDirectory { reason: String },
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Error, Debug)]
pub enum PersistenceError {
    #[error("Database error: {0}")]
    Database(String),
    
    #[error("Connection error: {0}")]
    Connection(String),
    
    #[error("Migration error: {0}")]
    Migration(String),
    
    #[error("Record not found: {table} with id {id}")]
    RecordNotFound { table: String, id: String },
    
    #[error("Constraint violation: {constraint}")]
    ConstraintViolation { constraint: String },
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Deserialization error: {0}")]
    DeserializationError(String),
    
    #[error("Not implemented: {0}")]
    NotImplemented(String),
}

pub type Result<T> = std::result::Result<T, UnifiedError>;
pub type SessionResult<T> = std::result::Result<T, SessionError>;
pub type GitResult<T> = std::result::Result<T, GitError>;
pub type PersistenceResult<T> = std::result::Result<T, PersistenceError>;
