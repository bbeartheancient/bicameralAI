use crate::types::EEGFrame;
use std::f64::consts::PI;
use tokio::time::{interval, Duration};
use tracing::info;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

/// Simulated EEG data generator
pub struct SimulatedEEG {
    sample_rate: u32,
    running: Arc<AtomicBool>,
    frame_count: Arc<std::sync::atomic::AtomicU64>,
    frequencies: Vec<f64>,
}

impl SimulatedEEG {
    pub fn new(sample_rate: u32) -> Self {
        // Channel order: F3, F4, C3, CZ, C4, P3, PZ, P4
        let frequencies = vec![8.0, 10.0, 12.0, 9.0, 11.0, 7.0, 13.0, 8.5];
        
        Self {
            sample_rate,
            running: Arc::new(AtomicBool::new(false)),
            frame_count: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            frequencies,
        }
    }

    /// Start generating EEG data - returns receiver for frames
    pub async fn start(&self) -> mpsc::Receiver<EEGFrame> {
        if self.running.swap(true, Ordering::SeqCst) {
            // Already running - return a dummy channel that will close immediately
            let (_, rx) = mpsc::channel(1);
            return rx;
        }
        
        info!("Simulated EEG started at {} Hz", self.sample_rate);
        
        let frame_interval = 1000 / self.sample_rate as u64;
        let (tx, rx) = mpsc::channel(1000);
        
        let running = self.running.clone();
        let frame_count = self.frame_count.clone();
        let sample_rate = self.sample_rate;
        let frequencies = self.frequencies.clone();
        
        // Spawn the generation task
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_millis(frame_interval));
            
            while running.load(Ordering::SeqCst) {
                ticker.tick().await;
                
                // Generate frame
                let count = frame_count.fetch_add(1, Ordering::SeqCst) + 1;
                let t = count as f64 / sample_rate as f64;
                let mut channels = Vec::with_capacity(8);
                
                for (ch, freq) in frequencies.iter().enumerate() {
                    let mut val = (2.0 * PI * freq * t + ch as f64 * 0.5).sin();
                    val += 0.3 * (2.0 * PI * freq * 2.0 * t).sin();
                    val += (t * 1000.0 + ch as f64).sin().cos() * 0.05;
                    channels.push(val * 50000.0 + 50000.0);
                }
                
                let frame = EEGFrame {
                    channels,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    frame: count,
                };
                
                if tx.send(frame).await.is_err() {
                    info!("EEG channel closed, stopping simulation");
                    running.store(false, Ordering::SeqCst);
                    break;
                }
                
                // Log periodically
                if count % (sample_rate as u64 * 5) == 0 {
                    info!("Simulated EEG: {} frames generated", count);
                }
            }
            
            info!("EEG generation task ended");
        });
        
        rx
    }
    
    /// Stop generating data
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        info!("Simulated EEG stopped at {} frames", self.frame_count.load(Ordering::SeqCst));
    }
    
    /// Check if running
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
    
    /// Get source type
    pub fn get_source_type(&self) -> String {
        "simulated".to_string()
    }
}

/// EEG Source manager that handles frame forwarding
pub struct EEGSourceManager {
    current_source: Option<SimulatedEEG>,
    frame_forwarder: Option<tokio::task::JoinHandle<()>>,
    running: Arc<AtomicBool>,
}

impl EEGSourceManager {
    pub fn new() -> Self {
        Self {
            current_source: None,
            frame_forwarder: None,
            running: Arc::new(AtomicBool::new(false)),
        }
    }
    
    /// Start simulated EEG source with frame forwarding
    pub async fn start_simulated<F>(&mut self, sample_rate: u32, forward_fn: F) -> anyhow::Result<()>
    where
        F: Fn(EEGFrame) + Send + 'static,
    {
        // Stop any existing source
        self.stop().await;
        
        // Create and start simulated source
        let source = SimulatedEEG::new(sample_rate);
        let mut rx = source.start().await;
        
        // Store running flag
        let running = self.running.clone();
        running.store(true, Ordering::SeqCst);
        
        // Spawn frame forwarder task
        let forwarder = tokio::spawn(async move {
            while let Some(frame) = rx.recv().await {
                if !running.load(Ordering::SeqCst) {
                    break;
                }
                forward_fn(frame);
            }
            info!("EEG frame forwarder stopped");
        });
        
        self.current_source = Some(source);
        self.frame_forwarder = Some(forwarder);
        
        info!("Started simulated EEG source at {} Hz", sample_rate);
        Ok(())
    }
    
    /// Stop current source
    pub async fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        
        if let Some(ref source) = self.current_source {
            source.stop();
        }
        
        if let Some(handle) = self.frame_forwarder.take() {
            let _ = handle.await;
        }
        
        self.current_source = None;
        info!("EEG source stopped");
    }
    
    /// Check if a source is running
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst) && 
        self.current_source.as_ref().map(|s| s.is_running()).unwrap_or(false)
    }
    
    /// Get current source type
    pub fn get_source_type(&self) -> Option<String> {
        self.current_source.as_ref()
            .map(|s| s.get_source_type())
    }
}

impl Default for EEGSourceManager {
    fn default() -> Self {
        Self::new()
    }
}
