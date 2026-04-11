// ---------------------------------------------------------------------------
// Session state machine
// ---------------------------------------------------------------------------

/// Session lifecycle states.
///
/// ```text
/// Starting → Initializing → Ready → Processing → Error
///                             ↑         │          │
///                             └─────────┘          │
///                             └────────────────────┘
///                                  (recovery)
/// Stopped (terminal — stdin EOF)
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionState {
    Starting,
    Initializing,
    Ready,
    Processing,
    Error,
    Stopped,
}

impl SessionState {
    /// Returns the valid next states from this state.
    pub fn valid_transitions(self) -> &'static [SessionState] {
        match self {
            Self::Starting => &[Self::Initializing, Self::Stopped],
            Self::Initializing => &[Self::Ready, Self::Error, Self::Stopped],
            Self::Ready => &[Self::Processing, Self::Stopped],
            Self::Processing => &[Self::Ready, Self::Error, Self::Stopped],
            Self::Error => &[Self::Ready, Self::Stopped],
            Self::Stopped => &[],
        }
    }

    /// Attempt a state transition. Returns `true` if the transition is valid.
    pub fn try_transition(&mut self, next: SessionState) -> bool {
        if self.valid_transitions().contains(&next) {
            *self = next;
            true
        } else {
            false
        }
    }
}

impl std::fmt::Display for SessionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Starting => write!(f, "starting"),
            Self::Initializing => write!(f, "initializing"),
            Self::Ready => write!(f, "ready"),
            Self::Processing => write!(f, "processing"),
            Self::Error => write!(f, "error"),
            Self::Stopped => write!(f, "stopped"),
        }
    }
}

// ---------------------------------------------------------------------------
// Session configuration (simplified — no auth, no permission mode)
// ---------------------------------------------------------------------------

/// Configuration for a sidecar session.
#[derive(Debug, Clone)]
pub struct SessionConfig {
    /// Path to the GGUF model file.
    pub model_path: String,
    /// Assembled system prompt (4 layers).
    pub system_prompt: String,
    /// Path to the user's notes folder.
    pub notes_folder: String,
    /// Root folder for sandbox scope (user's selected notes folder).
    pub root_folder: String,
    /// Maximum agent loop turns per prompt (default: 100).
    pub max_agent_turns: Option<u32>,
    /// Timeout for each `run_code` execution in ms (default: 45000).
    pub execution_timeout_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// Commands sent from app → session engine
// ---------------------------------------------------------------------------

/// Commands that the Tauri backend sends to the session engine.
#[derive(Debug)]
pub enum SessionCommand {
    /// Send a user prompt to the sidecar.
    Prompt {
        session_id: String,
        messages: Vec<PromptMessage>,
    },
    /// Cancel the active inference.
    Cancel { request_id: String },
    /// Shut down the session (close stdin).
    Shutdown,
}

/// A single message in a prompt request.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PromptMessage {
    pub role: String,
    pub content: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_transitions() {
        let mut state = SessionState::Starting;
        assert!(state.try_transition(SessionState::Initializing));
        assert_eq!(state, SessionState::Initializing);

        assert!(state.try_transition(SessionState::Ready));
        assert_eq!(state, SessionState::Ready);

        assert!(state.try_transition(SessionState::Processing));
        assert_eq!(state, SessionState::Processing);

        assert!(state.try_transition(SessionState::Ready));
        assert_eq!(state, SessionState::Ready);
    }

    #[test]
    fn invalid_transition() {
        let mut state = SessionState::Starting;
        assert!(!state.try_transition(SessionState::Processing));
        assert_eq!(state, SessionState::Starting); // unchanged
    }

    #[test]
    fn stopped_is_terminal() {
        let mut state = SessionState::Stopped;
        assert!(!state.try_transition(SessionState::Ready));
        assert!(!state.try_transition(SessionState::Starting));
        assert_eq!(state, SessionState::Stopped);
    }

    #[test]
    fn error_recovery() {
        let mut state = SessionState::Error;
        assert!(state.try_transition(SessionState::Ready));
        assert_eq!(state, SessionState::Ready);
    }

    #[test]
    fn display() {
        assert_eq!(format!("{}", SessionState::Ready), "ready");
        assert_eq!(format!("{}", SessionState::Processing), "processing");
    }
}
