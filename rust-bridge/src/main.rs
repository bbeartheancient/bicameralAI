pub mod types;
pub mod orchestrator;
pub mod lmstudio;
pub mod server;
pub mod bridge;
pub mod eeg_source;
pub mod qam_source;  // QAM16 signal source (replaces EEG)
pub mod spatialization;
pub mod compute_metrics;
pub mod query_cache;
pub mod peer_connection;

use clap::Parser;
use tracing::{info, Level};
use tracing_subscriber;

#[derive(Parser, Debug)]
#[command(name = "brainscan-bridge")]
#[command(about = "High-performance EEG-LMStudio bridge with hemisphere-based orchestration")]
#[command(version)]
struct Args {
    /// EEG Bridge WebSocket URL
    #[arg(long, default_value = "ws://localhost:8765")]
    eeg_url: String,

    /// LMStudio API URL
    #[arg(long, default_value = "http://localhost:1234")]
    lmstudio_url: String,

    /// Inference server port
    #[arg(short, long, default_value_t = 8766)]
    port: u16,

    /// Left hemisphere model
    #[arg(long)]
    left_model: Option<String>,

    /// Right hemisphere model
    #[arg(long)]
    right_model: Option<String>,

    /// LM Studio API key (or set LMSTUDIO_API_KEY env var)
    #[arg(long)]
    api_key: Option<String>,

    /// Log level
    #[arg(short, long, default_value = "info")]
    log_level: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    // Setup logging
    let log_level = match args.log_level.as_str() {
        "trace" => Level::TRACE,
        "debug" => Level::DEBUG,
        "info" => Level::INFO,
        "warn" => Level::WARN,
        "error" => Level::ERROR,
        _ => Level::INFO,
    };

    tracing_subscriber::fmt()
        .with_max_level(log_level)
        .init();

    info!("Brainscan Bridge v{}", env!("CARGO_PKG_VERSION"));
    info!("===========================");
    info!("EEG Bridge: {}", args.eeg_url);
    info!("LMStudio: {}", args.lmstudio_url);
    info!("Server Port: {}", args.port);

    // Create config
    let mut config = types::BridgeConfig::default();
    config.eeg_ws_url = args.eeg_url;
    config.lmstudio_url = args.lmstudio_url;
    config.inference_port = args.port;
    
    // Load API key from args or environment variable
    config.lmstudio_api_key = args.api_key.or_else(|| {
        std::env::var("LMSTUDIO_API_KEY").ok()
    });
    
    if config.lmstudio_api_key.is_some() {
        info!("LM Studio API key: configured");
    } else {
        info!("LM Studio API key: not configured (authentication may fail)");
    }

    if let Some(model) = args.left_model {
        config.default_models.insert("left".to_string(), model);
    }
    if let Some(model) = args.right_model {
        config.default_models.insert("right".to_string(), model);
    }

    // Create and run bridge
    let bridge = bridge::BrainscanBridge::new(config).await?;
    bridge.run().await?;

    Ok(())
}
