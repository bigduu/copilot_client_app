use crate::error::Result;
use crate::storage::message_pool_provider::MessagePoolStorageProvider;
use crate::storage::provider::StorageProvider;
use context_manager::structs::context::ChatContext;
use context_manager::structs::message::{InternalMessage, Role};
use std::path::Path;
use std::time::{Duration, Instant};
use uuid::Uuid;

/// Performance test results
#[derive(Debug, Clone)]
pub struct BenchmarkResult {
    pub test_name: String,
    pub duration: Duration,
    pub operations_count: usize,
    pub ops_per_second: f64,
}

impl BenchmarkResult {
    pub fn new(test_name: String, duration: Duration, operations_count: usize) -> Self {
        let ops_per_second = operations_count as f64 / duration.as_secs_f64();
        Self {
            test_name,
            duration,
            operations_count,
            ops_per_second,
        }
    }

    pub fn print(&self) {
        println!("\n=== {} ===", self.test_name);
        println!("Duration: {:.3}s", self.duration.as_secs_f64());
        println!("Operations: {}", self.operations_count);
        println!("Ops/sec: {:.2}", self.ops_per_second);
    }
}

/// Storage performance benchmarks
pub struct StorageBenchmarks {
    storage: MessagePoolStorageProvider,
}

impl StorageBenchmarks {
    pub fn new(storage_dir: impl AsRef<Path>) -> Self {
        Self {
            storage: MessagePoolStorageProvider::new(storage_dir),
        }
    }

    /// Create a test context with N messages
    fn create_test_context(num_messages: usize) -> ChatContext {
        let context_id = Uuid::new_v4();
        let mut context = ChatContext::new(
            context_id,
            "test-model".to_string(),
            "code".to_string(),
        );

        for i in 0..num_messages {
            let message = InternalMessage {
                role: if i % 2 == 0 { Role::User } else { Role::Assistant },
                content: vec![],
                tool_calls: None,
                tool_result: None,
                message_type: context_manager::MessageType::Text,
                metadata: Default::default(),
                rich_type: None,
            };
            context.add_message_to_branch("main", message);
        }

        context
    }

    /// Benchmark: Save context with N messages
    pub async fn bench_save_context(&self, message_count: usize) -> Result<BenchmarkResult> {
        let context = Self::create_test_context(message_count);
        
        let start = Instant::now();
        self.storage.save_context(&context).await?;
        let duration = start.elapsed();

        // Cleanup
        let _ = self.storage.delete_context(context.id).await;

        Ok(BenchmarkResult::new(
            format!("Save context ({} messages)", message_count),
            duration,
            1,
        ))
    }

    /// Benchmark: Load context with N messages
    pub async fn bench_load_context(&self, message_count: usize) -> Result<BenchmarkResult> {
        let context = Self::create_test_context(message_count);
        self.storage.save_context(&context).await?;

        let start = Instant::now();
        let loaded = self.storage.load_context(context.id).await?;
        let duration = start.elapsed();

        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap().message_pool.len(), message_count);

        // Cleanup
        let _ = self.storage.delete_context(context.id).await;

        Ok(BenchmarkResult::new(
            format!("Load context ({} messages)", message_count),
            duration,
            1,
        ))
    }

    /// Benchmark: Save and load multiple contexts
    pub async fn bench_multiple_contexts(&self, context_count: usize) -> Result<BenchmarkResult> {
        let mut context_ids = Vec::new();

        let start = Instant::now();
        for _ in 0..context_count {
            let context = Self::create_test_context(10);
            self.storage.save_context(&context).await?;
            context_ids.push(context.id);
        }

        for context_id in &context_ids {
            let _ = self.storage.load_context(*context_id).await?;
        }
        let duration = start.elapsed();

        // Cleanup
        for context_id in &context_ids {
            let _ = self.storage.delete_context(*context_id).await;
        }

        Ok(BenchmarkResult::new(
            format!("Save+Load {} contexts", context_count),
            duration,
            context_count * 2,
        ))
    }

    /// Benchmark: Concurrent reads
    pub async fn bench_concurrent_reads(&self, message_count: usize, concurrent_readers: usize) -> Result<BenchmarkResult> {
        let context = Self::create_test_context(message_count);
        self.storage.save_context(&context).await?;
        let context_id = context.id;

        let start = Instant::now();
        let mut handles = Vec::new();
        
        for _ in 0..concurrent_readers {
            let storage = MessagePoolStorageProvider::new(self.storage.base_dir.clone());
            let handle = tokio::spawn(async move {
                storage.load_context(context_id).await
            });
            handles.push(handle);
        }

        for handle in handles {
            let _ = handle.await.map_err(|e| anyhow::anyhow!("Join error: {}", e))??;
        }
        let duration = start.elapsed();

        // Cleanup
        let _ = self.storage.delete_context(context_id).await;

        Ok(BenchmarkResult::new(
            format!("Concurrent reads ({}x, {} msgs)", concurrent_readers, message_count),
            duration,
            concurrent_readers,
        ))
    }

    /// Benchmark: Incremental message saves
    pub async fn bench_incremental_saves(&self, save_count: usize) -> Result<BenchmarkResult> {
        let mut context = Self::create_test_context(0);
        self.storage.save_context(&context).await?;

        let start = Instant::now();
        for _ in 0..save_count {
            let message = InternalMessage {
                role: Role::User,
                content: vec![],
                tool_calls: None,
                tool_result: None,
                message_type: context_manager::MessageType::Text,
                metadata: Default::default(),
                rich_type: None,
            };
            context.add_message_to_branch("main", message);
            self.storage.save_context(&context).await?;
        }
        let duration = start.elapsed();

        // Cleanup
        let _ = self.storage.delete_context(context.id).await;

        Ok(BenchmarkResult::new(
            format!("Incremental saves ({} saves)", save_count),
            duration,
            save_count,
        ))
    }

    /// Run all benchmarks
    pub async fn run_all_benchmarks(&self) -> Result<Vec<BenchmarkResult>> {
        let mut results = Vec::new();

        println!("\n╔═══════════════════════════════════════════════╗");
        println!("║   Storage Performance Benchmarks             ║");
        println!("╚═══════════════════════════════════════════════╝");

        // Test different message counts
        for &count in &[10, 100, 1000] {
            let result = self.bench_save_context(count).await?;
            result.print();
            results.push(result);

            let result = self.bench_load_context(count).await?;
            result.print();
            results.push(result);
        }

        // Test multiple contexts
        let result = self.bench_multiple_contexts(100).await?;
        result.print();
        results.push(result);

        // Test concurrent reads
        let result = self.bench_concurrent_reads(100, 10).await?;
        result.print();
        results.push(result);

        // Test incremental saves
        let result = self.bench_incremental_saves(50).await?;
        result.print();
        results.push(result);

        println!("\n╔═══════════════════════════════════════════════╗");
        println!("║   Benchmark Summary                           ║");
        println!("╚═══════════════════════════════════════════════╝");
        for result in &results {
            println!(
                "{:<45} | {:.3}s | {:.2} ops/s",
                result.test_name,
                result.duration.as_secs_f64(),
                result.ops_per_second
            );
        }
        println!();

        Ok(results)
    }
}

// Expose base_dir for benchmarks
impl MessagePoolStorageProvider {
    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_bench_save_context() {
        let temp_dir = TempDir::new().unwrap();
        let benchmarks = StorageBenchmarks::new(temp_dir.path());

        let result = benchmarks.bench_save_context(10).await.unwrap();
        assert!(result.duration.as_millis() < 1000); // Should be fast
    }

    #[tokio::test]
    async fn test_bench_load_context() {
        let temp_dir = TempDir::new().unwrap();
        let benchmarks = StorageBenchmarks::new(temp_dir.path());

        let result = benchmarks.bench_load_context(10).await.unwrap();
        assert!(result.duration.as_millis() < 1000);
    }

    #[tokio::test]
    async fn test_bench_multiple_contexts() {
        let temp_dir = TempDir::new().unwrap();
        let benchmarks = StorageBenchmarks::new(temp_dir.path());

        let result = benchmarks.bench_multiple_contexts(5).await.unwrap();
        assert!(result.operations_count == 10); // 5 saves + 5 loads
    }

    #[tokio::test]
    async fn test_bench_concurrent_reads() {
        let temp_dir = TempDir::new().unwrap();
        let benchmarks = StorageBenchmarks::new(temp_dir.path());

        let result = benchmarks.bench_concurrent_reads(10, 5).await.unwrap();
        assert!(result.operations_count == 5);
    }
}

