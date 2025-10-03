use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io;
use std::os::unix;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use log::{warn, debug};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolboxManifest {
    pub sources: Vec<String>,
    pub files_count: u64,
    pub bytes_total: u64,
    pub copy_mode: bool,
    pub bin_entries: Vec<String>,
}

#[derive(Debug)]
pub struct ResolvedToolbox {
    pub root: PathBuf,
    pub bin: PathBuf,
    pub manifest: ToolboxManifest,
    guard: Option<ToolboxGuard>,
}

#[derive(Debug)]
pub struct ToolboxGuard {
    root: PathBuf,
    keep: bool,
}

impl Drop for ToolboxGuard {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}

static COPY_MODE: Lazy<bool> = Lazy::new(|| {
    #[cfg(windows)]
    {
        // Try to create a symlink in temp to detect privilege; if fails, prefer copy/hardlink
        let tmp = std::env::temp_dir().join("amp_symlink_check");
        let _ = fs::create_dir_all(&tmp);
        let src = tmp.join("src.txt");
        let dst = tmp.join("dst.txt");
        let _ = fs::write(&src, b"ok");
        let res = std::os::windows::fs::symlink_file(&src, &dst);
        let copy_mode = res.is_err();
        let _ = fs::remove_file(&src);
        let _ = fs::remove_file(&dst);
        let _ = fs::remove_dir_all(&tmp);
        copy_mode
    }
    #[cfg(not(windows))]
    {
        false
    }
});

fn hash_set(paths: &[PathBuf]) -> String {
    let mut hasher = blake3::Hasher::new();
    for p in paths {
        let c = fs::canonicalize(p).unwrap_or_else(|_| p.clone());
        hasher.update(c.to_string_lossy().as_bytes());
        if let Ok(meta) = fs::metadata(&c) {
            hasher.update(&meta.len().to_le_bytes());
            if let Ok(m) = meta.modified() {
                if let Ok(d) = m.duration_since(std::time::UNIX_EPOCH) {
                    hasher.update(&d.as_millis().to_le_bytes());
                }
            }
        }
    }
    hasher.finalize().to_hex().chars().take(16).collect()
}

pub fn limits() -> (u64, u64) {
    let max_files = env::var("AMP_TOOLBOX_MAX_FILES").ok().and_then(|s| s.parse().ok()).unwrap_or(5_000u64);
    let max_bytes = env::var("AMP_TOOLBOX_MAX_BYTES").ok().and_then(|s| s.parse().ok())
        .unwrap_or_else(|| {
            let max_mb = env::var("AMP_TOOLBOX_MAX_MB").ok().and_then(|s| s.parse().ok()).unwrap_or(250u64);
            max_mb * 1024 * 1024
        });
    (max_files, max_bytes)
}

fn ensure_dir(p: &Path) -> Result<()> {
    fs::create_dir_all(p).map_err(|e| anyhow!("create_dir_all {:?}: {}", p, e))
}

/// Validates that a symlink target stays within the given root directory
/// Returns the resolved target path if safe, or an error if it attempts to escape
fn validate_symlink_security(symlink_path: &Path, root: &Path) -> Result<PathBuf> {
    let symlink_metadata = fs::symlink_metadata(symlink_path)
        .map_err(|e| anyhow!("failed to read symlink metadata for {:?}: {}", symlink_path, e))?;
    
    if !symlink_metadata.file_type().is_symlink() {
        return Err(anyhow!("path is not a symlink: {:?}", symlink_path));
    }

    let target = fs::read_link(symlink_path)
        .map_err(|e| anyhow!("failed to read symlink target for {:?}: {}", symlink_path, e))?;
    
    // Resolve the target relative to the symlink's parent directory
    let resolved_target = if target.is_absolute() {
        target
    } else {
        symlink_path.parent()
            .ok_or_else(|| anyhow!("symlink has no parent directory: {:?}", symlink_path))?
            .join(target)
    };

    // Canonicalize both paths to handle all forms of path traversal
    let canonical_target = fs::canonicalize(&resolved_target)
        .map_err(|e| anyhow!("failed to canonicalize symlink target {:?}: {}", resolved_target, e))?;
    
    let canonical_root = fs::canonicalize(root)
        .map_err(|e| anyhow!("failed to canonicalize root {:?}: {}", root, e))?;

    // Ensure the resolved target is within the root directory
    if !canonical_target.starts_with(&canonical_root) {
        warn!("Blocked symlink traversal attack: {:?} -> {:?} (outside root {:?})", 
              symlink_path, canonical_target, canonical_root);
        return Err(anyhow!(
            "symlink target escapes toolbox root: {:?} -> {:?} (root: {:?})", 
            symlink_path, canonical_target, canonical_root
        ));
    }

    debug!("Validated safe symlink: {:?} -> {:?} (within root {:?})", 
           symlink_path, canonical_target, canonical_root);
    
    Ok(canonical_target)
}

/// Recursively validates all symlinks in a directory tree to prevent traversal attacks
fn validate_directory_symlinks(dir: &Path, root: &Path) -> Result<()> {
    for entry in WalkDir::new(dir).follow_links(false).into_iter() {
        let entry = entry.map_err(|e| anyhow!("walkdir error in {:?}: {}", dir, e))?;
        
        if entry.file_type().is_symlink() {
            validate_symlink_security(entry.path(), root)?;
        }
    }
    Ok(())
}

fn link_or_copy_file(src: &Path, dst: &Path, copy_mode: bool) -> io::Result<()> {
    if copy_mode {
        // Prefer hardlink when possible
        #[cfg(windows)]
        {
            if std::fs::hard_link(src, dst).is_ok() {
                return Ok(());
            }
        }
        fs::copy(src, dst).map(|_| ())
    } else {
        #[cfg(unix)]
        {
            unix::fs::symlink(src, dst)
        }
        #[cfg(not(unix))]
        {
            fs::copy(src, dst).map(|_| ())
        }
    }
}

pub fn resolve_toolboxes(roots: &[PathBuf], keep_artifacts: bool) -> Result<ResolvedToolbox> {
    if roots.is_empty() {
        return Err(anyhow!("no toolbox roots provided"));
    }

    let canon: Vec<PathBuf> = roots
        .iter()
        .map(|p| fs::canonicalize(p).map_err(|e| anyhow!("canonicalize {:?}: {}", p, e)))
        .collect::<Result<_>>()?;

    let base = dirs::home_dir()
        .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".amp-orchestra")
        .join("runtime_toolboxes");
    ensure_dir(&base)?;

    let digest = hash_set(&canon);
    let root_dir = base.join(&digest);
    let bin_dir = root_dir.join("bin");

    if root_dir.exists() {
        // Clean existing to ensure deterministic merge
        let _ = fs::remove_dir_all(&root_dir);
    }
    ensure_dir(&bin_dir)?;

    let (max_files, max_bytes) = limits();
    let mut files_count: u64 = 0;
    let mut bytes_total: u64 = 0;
    let mut bin_entries: Vec<String> = Vec::new();

    for (idx, r) in canon.iter().enumerate() {
        let rbin = r.join("bin");
        if !rbin.exists() { continue; }
        
        // First pass: validate all symlinks in this toolbox root for security
        debug!("Validating symlinks in toolbox root: {:?}", r);
        validate_directory_symlinks(&rbin, r)?;
        
        for entry in WalkDir::new(&rbin).follow_links(false).into_iter().filter_map(|e| e.ok()) {
            let ft = entry.file_type();
            if ft.is_symlink() { 
                // Skip symlinks during file processing - we validated them above for security
                debug!("Skipping symlink during file processing: {:?}", entry.path());
                continue; 
            }
            if !ft.is_file() { continue; }
            let rel = entry.path().strip_prefix(&rbin).unwrap();
            let dst = bin_dir.join(rel);
            if let Some(parent) = dst.parent() { ensure_dir(parent)?; }

            let meta = fs::metadata(entry.path())?;
            let sz = meta.len();
            if files_count + 1 > max_files { return Err(anyhow!("toolbox file limit exceeded")); }
            if bytes_total + sz > max_bytes { return Err(anyhow!("toolbox size limit exceeded")); }

            // Last-write-wins: if exists, remove before overwriting
            if dst.exists() { let _ = fs::remove_file(&dst); }
            link_or_copy_file(entry.path(), &dst, *COPY_MODE)?;
            files_count += 1;
            bytes_total += sz;
            bin_entries.push(format!("{}:{}:{}", idx, r.display(), rel.display()));
        }
    }

    let guard = ToolboxGuard { root: root_dir.clone(), keep: keep_artifacts };
    let manifest = ToolboxManifest {
        sources: canon.iter().map(|p| p.to_string_lossy().to_string()).collect(),
        files_count,
        bytes_total,
        copy_mode: *COPY_MODE,
        bin_entries: bin_entries.clone(),
    };

    Ok(ResolvedToolbox { root: root_dir, bin: bin_dir, manifest, guard: Some(guard) })
}

impl ResolvedToolbox {
    pub fn take_guard(&mut self) -> Option<ToolboxGuard> { self.guard.take() }
}
