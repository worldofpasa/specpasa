//! GUI-safe Node.js discovery. macOS apps launched from Finder inherit
//! launchd's minimal PATH (`/usr/bin:/bin:...`), which has neither `node` nor
//! `claude`. One enriched PATH solves both: the shell finds node with it, and
//! passes it to the spawned server so the providers package's PATH scan finds
//! the claude CLI (packages/providers/src/node/detect.ts).

use std::path::{Path, PathBuf};
use std::process::Command;

const MIN_NODE_MAJOR: u32 = 22;

/// PATH from an interactive login shell — sources ~/.zprofile & friends where
/// homebrew/nvm/volta put their bin dirs.
fn login_shell_path() -> Option<String> {
    #[cfg(unix)]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let out = Command::new(&shell)
            .args(["-lc", "printf %s \"$PATH\""])
            .output()
            .ok()?;
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).into_owned();
            if !path.trim().is_empty() {
                return Some(path);
            }
        }
        None
    }
    #[cfg(not(unix))]
    {
        None
    }
}

/// Keep child processes from flashing a console window on Windows — the shell
/// itself is windows_subsystem = "windows", but children default to consoles.
#[cfg(windows)]
pub fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
pub fn hide_console(_cmd: &mut Command) {}

/// nvm keeps per-version bin dirs; newest first so the version gate picks the
/// most recent install.
#[cfg(unix)]
fn nvm_version_bins(home: &str) -> Vec<String> {
    let versions_dir = PathBuf::from(home).join(".nvm/versions/node");
    let Ok(entries) = std::fs::read_dir(&versions_dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path().join("bin").to_string_lossy().into_owned())
        .collect();
    dirs.sort();
    dirs.reverse();
    dirs
}

/// Login-shell PATH + current PATH + well-known toolchain dirs, deduped.
pub fn enriched_path() -> String {
    let sep = if cfg!(windows) { ';' } else { ':' };
    let mut dirs: Vec<String> = Vec::new();
    if let Some(path) = login_shell_path() {
        dirs.extend(path.split(sep).map(String::from));
    }
    if let Ok(path) = std::env::var("PATH") {
        dirs.extend(path.split(sep).map(String::from));
    }
    #[cfg(unix)]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        for dir in [
            format!("{home}/.claude/local"),
            format!("{home}/.local/bin"),
            format!("{home}/.bun/bin"),
            format!("{home}/.volta/bin"),
            "/opt/homebrew/bin".into(),
            "/usr/local/bin".into(),
            "/usr/bin".into(),
            "/bin".into(),
        ] {
            dirs.push(dir);
        }
        dirs.extend(nvm_version_bins(&home));
    }
    #[cfg(windows)]
    {
        let profile = std::env::var("USERPROFILE").unwrap_or_default();
        for dir in [
            // Node.js MSI default install location.
            std::env::var("ProgramFiles").map(|p| format!("{p}\\nodejs")).unwrap_or_default(),
            // npm -g shims — claude.cmd and friends land here.
            std::env::var("APPDATA").map(|p| format!("{p}\\npm")).unwrap_or_default(),
            std::env::var("LOCALAPPDATA").map(|p| format!("{p}\\Volta\\bin")).unwrap_or_default(),
            format!("{profile}\\scoop\\shims"),
            format!("{profile}\\.claude\\local"),
            format!("{profile}\\.local\\bin"),
            // nvm-windows: symlink to the currently-active node version.
            std::env::var("NVM_SYMLINK").unwrap_or_default(),
        ] {
            dirs.push(dir);
        }
    }
    let mut seen = std::collections::HashSet::new();
    let deduped: Vec<String> = dirs
        .into_iter()
        .filter(|d| !d.is_empty() && seen.insert(d.clone()))
        .collect();
    deduped.join(&sep.to_string())
}

/// `node --version` → major, if the candidate runs at all.
fn node_major(candidate: &Path) -> Option<u32> {
    let mut cmd = Command::new(candidate);
    cmd.arg("--version");
    hide_console(&mut cmd);
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&out.stdout);
    version.trim().strip_prefix('v')?.split('.').next()?.parse().ok()
}

/// First `node` >= MIN_NODE_MAJOR on the enriched PATH, or an actionable
/// error for the boot dialog.
pub fn find_node(path_env: &str) -> Result<PathBuf, String> {
    let sep = if cfg!(windows) { ';' } else { ':' };
    let binary = if cfg!(windows) { "node.exe" } else { "node" };
    let mut found_old: Option<(PathBuf, u32)> = None;
    for dir in path_env.split(sep).filter(|d| !d.is_empty()) {
        let candidate = Path::new(dir).join(binary);
        if !candidate.is_file() {
            continue;
        }
        if let Some(major) = node_major(&candidate) {
            if major >= MIN_NODE_MAJOR {
                return Ok(candidate);
            }
            found_old.get_or_insert((candidate, major));
        }
    }
    Err(match found_old {
        Some((path, major)) => format!(
            "Node.js {major} was found at {} but specpasa needs Node.js {MIN_NODE_MAJOR}+.\n\nInstall a newer Node.js from https://nodejs.org and relaunch.",
            path.display()
        ),
        None => format!(
            "Node.js was not found on this machine.\n\nspecpasa Desktop needs Node.js {MIN_NODE_MAJOR}+ (it also powers the claude CLI). Install it from https://nodejs.org and relaunch."
        ),
    })
}
