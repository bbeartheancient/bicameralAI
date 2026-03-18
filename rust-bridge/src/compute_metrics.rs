/// Compute performance metrics and optimization tracking
use std::time::{Duration, Instant};

/// Tracks compute performance metrics for the bridge
pub struct ComputeMetrics {
    frame_count: u64,
    total_processing_time: Duration,
    last_update: Instant,
    frame_times: Vec<Duration>, // Rolling window of last 100 frame times
    chat_queries_processed: u64,
}

impl ComputeMetrics {
    pub fn new() -> Self {
        Self {
            frame_count: 0,
            total_processing_time: Duration::ZERO,
            last_update: Instant::now(),
            frame_times: Vec::with_capacity(100),
            chat_queries_processed: 0,
        }
    }
    
    /// Record a frame processing
    pub fn record_frame(&mut self, duration: Duration) {
        self.frame_count += 1;
        self.total_processing_time += duration;
        
        // Keep rolling window
        if self.frame_times.len() >= 100 {
            self.frame_times.remove(0);
        }
        self.frame_times.push(duration);
    }
    
    /// Get average frame processing time
    pub fn avg_frame_time(&self) -> Duration {
        if self.frame_times.is_empty() {
            return Duration::ZERO;
        }
        self.total_processing_time.div_f64(self.frame_count.max(1) as f64)
    }
    
    /// Get current FPS
    pub fn current_fps(&self) -> f64 {
        let elapsed = self.last_update.elapsed().as_secs_f64();
        if elapsed > 0.0 {
            self.frame_count as f64 / elapsed
        } else {
            0.0
        }
    }
    
    /// Get throughput in frames per second (last 100 frames)
    pub fn recent_throughput_fps(&self) -> f64 {
        if self.frame_times.len() < 2 {
            return 0.0;
        }
        
        let total: Duration = self.frame_times.iter().sum();
        self.frame_times.len() as f64 / total.as_secs_f64().max(0.001)
    }
    
    /// Get 95th percentile latency (worst case excluding outliers)
    pub fn p95_latency_ms(&self) -> f64 {
        if self.frame_times.is_empty() {
            return 0.0;
        }
        
        let mut sorted: Vec<f64> = self.frame_times.iter()
            .map(|d| d.as_secs_f64() * 1000.0)
            .collect();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        
        let idx = ((sorted.len() as f64) * 0.95) as usize;
        sorted.get(idx).copied().unwrap_or(0.0)
    }
    
    /// Print optimization report
    pub fn report(&self) -> String {
        format!(
            "Compute Metrics:\n\
            Total frames: {}\n\
            Avg frame time: {:.2}ms\n\
            Current throughput: {:.1} FPS\n\
            Recent throughput: {:.1} FPS\n\
            P95 latency: {:.2}ms\n\
            Chat queries: {}",
            self.frame_count,
            self.avg_frame_time().as_secs_f64() * 1000.0,
            self.current_fps(),
            self.recent_throughput_fps(),
            self.p95_latency_ms(),
            self.chat_queries_processed
        )
    }
}

/// Optimization suggestions based on metrics
pub struct OptimizationAdvisor;

impl OptimizationAdvisor {
    /// Analyze current state and suggest optimizations
    pub fn suggest(fps: f64, latency_ms: f64) -> Vec<String> {
        let mut suggestions = Vec::new();
        
        if fps > 120.0 {
            suggestions.push("Frame rate exceeds 120 FPS - consider increasing FRAME_SKIP to reduce CPU usage".to_string());
        }
        
        if latency_ms > 10.0 {
            suggestions.push("High frame latency detected - consider enabling batch processing".to_string());
        }
        
        if fps < 30.0 {
            suggestions.push("Low frame rate - check if LMStudio queries are blocking EEG pipeline".to_string());
        }
        
        suggestions
    }
}

impl Default for ComputeMetrics {
    fn default() -> Self {
        Self::new()
    }
}
