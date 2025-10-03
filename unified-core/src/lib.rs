pub mod domain;
pub mod git;
pub mod persistence;
pub mod error;
pub mod worktree_manager;

pub use domain::*;
pub use git::*;
pub use persistence::*;
pub use error::*;
pub use worktree_manager::*;

#[cfg(feature = "legacy_node")]
pub mod legacy_node;

#[cfg(feature = "legacy_node")]
pub use legacy_node::*;

#[cfg(not(feature = "legacy_node"))]
pub mod modern;

#[cfg(not(feature = "legacy_node"))]
pub use modern::*;

#[cfg(test)]
mod tests;
