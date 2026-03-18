use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Cache entry with expiration
struct CacheEntry<T> {
    value: T,
    expires_at: Instant,
}

impl<T> CacheEntry<T> {
    fn new(value: T, ttl: Duration) -> Self {
        Self {
            value,
            expires_at: Instant::now() + ttl,
        }
    }

    fn is_expired(&self) -> bool {
        Instant::now() > self.expires_at
    }
}

/// Simple TTL cache for query responses
pub struct QueryCache<T: Clone> {
    cache: Arc<RwLock<HashMap<String, CacheEntry<T>>>>,
    ttl: Duration,
    stats: Arc<RwLock<CacheStats>>,
}

/// Cache statistics
#[derive(Debug, Clone, Default)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub evictions: u64,
    pub size: usize,
}

impl<T: Clone> QueryCache<T> {
    /// Create a new cache with the specified TTL
    pub fn new(ttl_seconds: u64) -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            ttl: Duration::from_secs(ttl_seconds),
            stats: Arc::new(RwLock::new(CacheStats::default())),
        }
    }

    /// Get a value from the cache
    pub async fn get(&self, key: &str) -> Option<T> {
        let mut cache = self.cache.write().await;
        
        if let Some(entry) = cache.get(key) {
            if entry.is_expired() {
                // Remove expired entry
                cache.remove(key);
                drop(cache);
                
                // Update stats
                let mut stats = self.stats.write().await;
                stats.evictions += 1;
                stats.misses += 1;
                stats.size = self.cache.read().await.len();
                
                return None;
            }
            
            // Cache hit
            let value = entry.value.clone();
            drop(cache);
            
            let mut stats = self.stats.write().await;
            stats.hits += 1;
            
            return Some(value);
        }
        
        // Cache miss
        drop(cache);
        let mut stats = self.stats.write().await;
        stats.misses += 1;
        
        None
    }

    /// Insert a value into the cache
    pub async fn insert(&self, key: String, value: T) {
        let mut cache = self.cache.write().await;
        let entry = CacheEntry::new(value, self.ttl);
        cache.insert(key, entry);
        let size = cache.len();
        drop(cache);
        
        let mut stats = self.stats.write().await;
        stats.size = size;
    }

    /// Clear all entries from the cache
    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        let evicted = cache.len();
        cache.clear();
        drop(cache);
        
        let mut stats = self.stats.write().await;
        stats.evictions += evicted as u64;
        stats.size = 0;
    }

    /// Get current cache statistics
    pub async fn get_stats(&self) -> CacheStats {
        let cache = self.cache.read().await;
        let mut stats = self.stats.read().await.clone();
        stats.size = cache.len();
        stats
    }

    /// Get the hit rate (percentage of cache hits)
    pub async fn hit_rate(&self) -> f64 {
        let stats = self.stats.read().await;
        let total = stats.hits + stats.misses;
        if total == 0 {
            0.0
        } else {
            (stats.hits as f64 / total as f64) * 100.0
        }
    }

    /// Remove expired entries (can be called periodically)
    pub async fn cleanup(&self) {
        let mut cache = self.cache.write().await;
        let before = cache.len();
        cache.retain(|_, entry| !entry.is_expired());
        let after = cache.len();
        let evicted = before - after;
        drop(cache);
        
        if evicted > 0 {
            let mut stats = self.stats.write().await;
            stats.evictions += evicted as u64;
            stats.size = after;
        }
    }
}

/// Generate a cache key from query parameters
pub fn generate_cache_key(query: &str, hemisphere: &str, left_model: &str, right_model: &str, comparator_model: &str) -> String {
    // Normalize the query (lowercase, trim whitespace)
    let normalized = query.to_lowercase().trim().to_string();
    
    // Create a unique key based on query + hemisphere + models
    // This ensures different model combinations get different cache entries
    format!(
        "{}|{}|{}|{}|{}",
        normalized, hemisphere, left_model, right_model, comparator_model
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cache_basic_operations() {
        let cache = QueryCache::<String>::new(60);
        
        // Test insert and get
        cache.insert("key1".to_string(), "value1".to_string()).await;
        let value = cache.get("key1").await;
        assert_eq!(value, Some("value1".to_string()));
        
        // Test stats
        let stats = cache.get_stats().await;
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 0);
        assert_eq!(stats.size, 1);
    }

    #[tokio::test]
    async fn test_cache_miss() {
        let cache = QueryCache::<String>::new(60);
        
        let value = cache.get("nonexistent").await;
        assert_eq!(value, None);
        
        let stats = cache.get_stats().await;
        assert_eq!(stats.hits, 0);
        assert_eq!(stats.misses, 1);
    }

    #[tokio::test]
    async fn test_cache_expiration() {
        let cache = QueryCache::<String>::new(1); // 1 second TTL
        
        cache.insert("key1".to_string(), "value1".to_string()).await;
        
        // Should exist immediately
        let value = cache.get("key1").await;
        assert_eq!(value, Some("value1".to_string()));
        
        // Wait for expiration
        tokio::time::sleep(Duration::from_secs(2)).await;
        
        // Should be expired now
        let value = cache.get("key1").await;
        assert_eq!(value, None);
        
        let stats = cache.get_stats().await;
        assert!(stats.evictions >= 1);
    }

    #[tokio::test]
    async fn test_cache_clear() {
        let cache = QueryCache::<String>::new(60);
        
        cache.insert("key1".to_string(), "value1".to_string()).await;
        cache.insert("key2".to_string(), "value2".to_string()).await;
        
        cache.clear().await;
        
        let value = cache.get("key1").await;
        assert_eq!(value, None);
        
        let stats = cache.get_stats().await;
        assert_eq!(stats.size, 0);
        assert_eq!(stats.evictions, 2);
    }

    #[tokio::test]
    async fn test_cache_hit_rate() {
        let cache = QueryCache::<String>::new(60);
        
        // 2 misses
        cache.get("key1").await;
        cache.get("key2").await;
        
        // Insert and get = 1 hit
        cache.insert("key1".to_string(), "value1".to_string()).await;
        cache.get("key1").await;
        
        let hit_rate = cache.hit_rate().await;
        assert!((hit_rate - 33.33).abs() < 0.1); // 1 hit / 3 total = 33.33%
    }
}
