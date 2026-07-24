//! Local server process manager: migrate → spawn → readiness → kill. The
//! server is the unmodified specpasa Node build staged under
//! resources/server (see ../scripts/stage-server.mjs).

use std::fs;
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use crate::nodejs::hide_console;

/// Matches the PUBLIC_APP_URL baked into the desktop web build (cosmetic
/// only — invite-link display; a fallback port just renders stale links).
const PREFERRED_PORT: u16 = 4977;
const READY_TIMEOUT: Duration = Duration::from_secs(30);
const GRACE_PERIOD: Duration = Duration::from_secs(5);

pub struct BootPaths {
    /// resources/server inside the bundle.
    pub server_dir: PathBuf,
    /// OS app-data dir; DB, uploads, sessions, logs, pidfile all live here.
    pub data_dir: PathBuf,
}

pub fn pick_port() -> u16 {
    if TcpListener::bind(("127.0.0.1", PREFERRED_PORT)).is_ok() {
        return PREFERRED_PORT;
    }
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(PREFERRED_PORT)
}

/// 32 random bytes hex — satisfies astro:env's min-16-chars SPECPASA_SECRET.
/// Generated once, persisted with owner-only permissions.
pub fn load_or_create_secret(data_dir: &Path) -> std::io::Result<String> {
    let path = data_dir.join("secret");
    if let Ok(existing) = fs::read_to_string(&path) {
        let trimmed = existing.trim().to_string();
        if trimmed.len() >= 16 {
            return Ok(trimmed);
        }
    }
    let secret: String = (0..32).map(|_| format!("{:02x}", rand::random::<u8>())).collect();
    let mut file = fs::File::create(&path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(secret.as_bytes())?;
    Ok(secret)
}

/// Reap a server left behind by a crashed shell (the pidfile is written on
/// every spawn and removed on clean exit).
pub fn kill_orphan(data_dir: &Path) {
    let pidfile = data_dir.join("server.pid");
    let Ok(content) = fs::read_to_string(&pidfile) else {
        return;
    };
    if let Ok(pid) = content.trim().parse::<i32>() {
        #[cfg(unix)]
        unsafe {
            if libc::kill(pid, 0) == 0 {
                libc::kill(pid, libc::SIGTERM);
                std::thread::sleep(Duration::from_millis(500));
                libc::kill(pid, libc::SIGKILL);
            }
        }
        #[cfg(windows)]
        {
            let mut cmd = Command::new("taskkill");
            cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
            hide_console(&mut cmd);
            let _ = cmd.output();
        }
    }
    let _ = fs::remove_file(&pidfile);
}

pub fn write_pidfile(data_dir: &Path, pid: u32) {
    let _ = fs::write(data_dir.join("server.pid"), pid.to_string());
}

pub fn remove_pidfile(data_dir: &Path) {
    let _ = fs::remove_file(data_dir.join("server.pid"));
}

fn database_url(data_dir: &Path) -> String {
    // libsql parses this as a URL — Windows backslashes are not valid there.
    let path = data_dir.join("specpasa.db").display().to_string().replace('\\', "/");
    format!("file:{path}")
}

fn open_log(data_dir: &Path) -> std::io::Result<fs::File> {
    let logs = data_dir.join("logs");
    fs::create_dir_all(&logs)?;
    let path = logs.join("server.log");
    // Naive rotation: truncate once the log passes ~5 MB.
    let too_big = fs::metadata(&path).map(|m| m.len() > 5_000_000).unwrap_or(false);
    fs::OpenOptions::new().create(true).append(!too_big).truncate(too_big).write(true).open(path)
}

/// Run drizzle migrations against the app-data SQLite file. Blocking; must
/// succeed before the server starts.
pub fn migrate(node: &Path, paths: &BootPaths, path_env: &str) -> Result<(), String> {
    // Staged by stage-server.mjs as a plain folder (the @specpasa/db package
    // itself is bundled into dist).
    let migrations = paths.server_dir.join("drizzle");
    let log = open_log(&paths.data_dir).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(node);
    cmd.arg(paths.server_dir.join("migrate.mjs"))
        .arg(&migrations)
        .current_dir(&paths.server_dir)
        .env("DATABASE_URL", database_url(&paths.data_dir))
        .env("PATH", path_env)
        .stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?))
        .stderr(Stdio::from(log));
    hide_console(&mut cmd);
    let status = cmd.status().map_err(|e| format!("could not run migrations: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Database migration failed — see logs/server.log in the app data folder.".into())
    }
}

pub fn spawn_server(
    node: &Path,
    paths: &BootPaths,
    port: u16,
    secret: &str,
    path_env: &str,
) -> std::io::Result<Child> {
    let log = open_log(&paths.data_dir)?;
    let mut cmd = Command::new(node);
    cmd.arg(paths.server_dir.join("dist/server/entry.mjs"))
        // cwd = app-data: the session dir ("./sessions") and any other
        // relative writes land outside the sealed .app bundle.
        .current_dir(&paths.data_dir)
        .env("NODE_ENV", "production")
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("DATABASE_URL", database_url(&paths.data_dir))
        .env("SPECPASA_SECRET", secret)
        // Trusted local mode: 127.0.0.1-bound single-user instance — the
        // middleware signs requests in as the (auto-provisioned) owner, no
        // password. Never set for remote/self-hosted mode, which is a
        // different server entirely.
        .env("SPECPASA_LOCAL_AUTOLOGIN", "1")
        // The enriched PATH is what lets the server find the claude CLI.
        .env("PATH", path_env)
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log));
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Own process group: killing -pgid takes down the whole tree,
        // including any claude processes an interview spawned.
        cmd.process_group(0);
    }
    hide_console(&mut cmd);
    let child = cmd.spawn()?;
    write_pidfile(&paths.data_dir, child.id());
    Ok(child)
}

/// Any HTTP reply counts as up — a 500 still proves the process is serving.
pub fn wait_ready(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/");
    let deadline = Instant::now() + READY_TIMEOUT;
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(2)).build();
    while Instant::now() < deadline {
        match agent.get(&url).call() {
            Ok(_) | Err(ureq::Error::Status(..)) => return true,
            Err(_) => std::thread::sleep(Duration::from_millis(250)),
        }
    }
    false
}

pub fn stop_server(child: &mut Child, data_dir: &Path) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        unsafe {
            libc::kill(-pid, libc::SIGTERM);
        }
        let deadline = Instant::now() + GRACE_PERIOD;
        while Instant::now() < deadline {
            if matches!(child.try_wait(), Ok(Some(_))) {
                remove_pidfile(data_dir);
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
        let _ = child.wait();
    }
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &child.id().to_string(), "/T", "/F"]);
        hide_console(&mut cmd);
        let _ = cmd.output();
        let _ = child.wait();
    }
    remove_pidfile(data_dir);
}
