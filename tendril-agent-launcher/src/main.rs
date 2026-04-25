use std::process::{Command, Stdio};

const TRIPLE: &str = env!("TARGET_TRIPLE");

fn main() {
    let exe = std::env::current_exe().expect("failed to resolve own executable path");
    let dir = exe.parent().expect("executable has no parent directory");

    // On Windows, Tauri bundles externalBin entries with .exe suffix.
    // Node.js ignores file extensions so this works fine.
    let exe_suffix = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let payload_name = format!("tendril-agent-payload-{TRIPLE}{exe_suffix}");
    // Tauri dev mode strips the triple suffix when copying externalBin to target/debug/
    let payload_name_short = format!("tendril-agent-payload{exe_suffix}");

    // Search order:
    // 1. Next to this exe with triple suffix (production bundle)
    // 2. Next to this exe without triple suffix (Tauri dev mode strips triple)
    // 3. binaries/ relative to src-tauri (dev: target/debug/../../binaries)
    // 4. binaries/ relative to cwd (fallback)
    let candidates: Vec<std::path::PathBuf> = vec![
        dir.join(&payload_name),
        dir.join(&payload_name_short),
        dir.join("../../binaries").join(&payload_name),
        std::env::current_dir()
            .map(|d| d.join("binaries").join(&payload_name))
            .unwrap_or_default(),
    ];

    let payload = candidates.iter().find(|p| p.exists());

    let payload = match payload {
        Some(p) => p,
        None => {
            eprintln!("[launcher] payload not found, searched:");
            for c in &candidates {
                eprintln!("  - {}", c.display());
            }
            std::process::exit(1);
        }
    };

    let status = Command::new("node")
        // Use -e with require() to force CJS loading. Node.js v22+ defaults
        // extensionless files to ESM (which breaks the esbuild CJS bundle).
        .arg("-e")
        .arg(format!("require(\"{}\")", payload.to_string_lossy().replace('\\', "\\\\")))
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status();

    match status {
        Ok(s) => std::process::exit(s.code().unwrap_or(1)),
        Err(e) => {
            eprintln!("[launcher] failed to spawn node: {e}");
            std::process::exit(1);
        }
    }
}
