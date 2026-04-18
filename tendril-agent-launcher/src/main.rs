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
    let payload = dir.join(format!("tendril-agent-payload-{TRIPLE}{exe_suffix}"));

    if !payload.exists() {
        eprintln!(
            "[launcher] payload not found: {}",
            payload.display()
        );
        std::process::exit(1);
    }

    let status = Command::new("node")
        .arg(&payload)
        .args(std::env::args().skip(1))
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
