//! Retry Processor
//!
//! This processor wraps other processors and provides automatic retry functionality
//! with configurable backoff strategies.

use crate::pipeline::{MessageProcessor, ProcessError, ProcessResult, ProcessingContext};
use std::time::Duration;

/// Retry Strategy
///
/// Defines how to retry failed operations.
#[derive(Debug, Clone)]
pub enum RetryStrategy {
    /// Fixed delay between retries
    FixedDelay {
        /// Delay duration
        delay: Duration,
        /// Maximum number of retries
        max_retries: usize,
    },
    /// Exponential backoff
    ExponentialBackoff {
        /// Initial delay
        initial_delay: Duration,
        /// Multiplier for each retry
        multiplier: f64,
        /// Maximum delay
        max_delay: Duration,
        /// Maximum number of retries
        max_retries: usize,
    },
    /// Linear backoff
    LinearBackoff {
        /// Initial delay
        initial_delay: Duration,
        /// Increment per retry
        increment: Duration,
        /// Maximum number of retries
        max_retries: usize,
    },
}

impl Default for RetryStrategy {
    fn default() -> Self {
        RetryStrategy::ExponentialBackoff {
            initial_delay: Duration::from_millis(100),
            multiplier: 2.0,
            max_delay: Duration::from_secs(5),
            max_retries: 3,
        }
    }
}

impl RetryStrategy {
    /// Get delay for a specific retry attempt
    fn get_delay(&self, attempt: usize) -> Option<Duration> {
        match self {
            RetryStrategy::FixedDelay { delay, max_retries } => {
                if attempt < *max_retries {
                    Some(*delay)
                } else {
                    None
                }
            }
            RetryStrategy::ExponentialBackoff {
                initial_delay,
                multiplier,
                max_delay,
                max_retries,
            } => {
                if attempt >= *max_retries {
                    return None;
                }
                let delay = Duration::from_secs_f64(
                    initial_delay.as_secs_f64() * multiplier.powi(attempt as i32),
                );
                Some(delay.min(*max_delay))
            }
            RetryStrategy::LinearBackoff {
                initial_delay,
                increment,
                max_retries,
            } => {
                if attempt >= *max_retries {
                    return None;
                }
                Some(*initial_delay + *increment * attempt as u32)
            }
        }
    }

    /// Get maximum number of retries
    fn max_retries(&self) -> usize {
        match self {
            RetryStrategy::FixedDelay { max_retries, .. } => *max_retries,
            RetryStrategy::ExponentialBackoff { max_retries, .. } => *max_retries,
            RetryStrategy::LinearBackoff { max_retries, .. } => *max_retries,
        }
    }
}

/// Retry Processor
///
/// Wraps another processor and automatically retries on failure.
///
/// # Example
///
/// ```no_run
/// use context_manager::pipeline::processors::{RetryProcessor, ValidationProcessor};
/// use context_manager::pipeline::processors::retry::RetryStrategy;
/// use std::time::Duration;
///
/// let strategy = RetryStrategy::ExponentialBackoff {
///     initial_delay: Duration::from_millis(100),
///     multiplier: 2.0,
///     max_delay: Duration::from_secs(5),
///     max_retries: 3,
/// };
///
/// let processor = RetryProcessor::new(
///     Box::new(ValidationProcessor::new()),
///     strategy,
/// );
/// ```
pub struct RetryProcessor {
    /// Inner processor to retry
    inner: Box<dyn MessageProcessor>,
    /// Retry strategy
    strategy: RetryStrategy,
    /// Name of this processor
    name: String,
}

impl RetryProcessor {
    /// Create a new retry processor
    pub fn new(inner: Box<dyn MessageProcessor>, strategy: RetryStrategy) -> Self {
        let name = format!("retry[{}]", inner.name());
        Self {
            inner,
            strategy,
            name,
        }
    }

    /// Create with default strategy (exponential backoff, 3 retries)
    pub fn with_default_strategy(inner: Box<dyn MessageProcessor>) -> Self {
        Self::new(inner, RetryStrategy::default())
    }
}

impl MessageProcessor for RetryProcessor {
    fn name(&self) -> &str {
        &self.name
    }

    fn process<'a>(&self, ctx: &mut ProcessingContext<'a>) -> Result<ProcessResult, ProcessError> {
        let mut attempt = 0;
        let max_retries = self.strategy.max_retries();

        loop {
            // Try to process
            match self.inner.process(ctx) {
                Ok(result) => {
                    // Success - record retry count if any
                    if attempt > 0 {
                        ctx.add_metadata(
                            format!("{}_retry_count", self.inner.name()),
                            serde_json::json!(attempt),
                        );
                    }
                    return Ok(result);
                }
                Err(err) => {
                    // Check if we should retry
                    if !is_retryable(&err) {
                        // Non-retryable error, fail immediately
                        return Err(err);
                    }

                    attempt += 1;

                    // Check if we've exhausted retries
                    if attempt > max_retries {
                        // Add retry metadata before failing
                        ctx.add_metadata(
                            format!("{}_retry_count", self.inner.name()),
                            serde_json::json!(attempt - 1),
                        );
                        ctx.add_metadata(
                            format!("{}_retry_exhausted", self.inner.name()),
                            serde_json::json!(true),
                        );
                        return Err(err);
                    }

                    // Get delay for this attempt
                    if let Some(delay) = self.strategy.get_delay(attempt - 1) {
                        // Record retry attempt
                        ctx.add_metadata(
                            format!("{}_retry_attempt", self.inner.name()),
                            serde_json::json!({
                                "attempt": attempt,
                                "max": max_retries,
                                "delay_ms": delay.as_millis(),
                            }),
                        );

                        // Wait before retrying (in real async context)
                        // For now, we'll use std::thread::sleep for simplicity
                        // In production, this should be tokio::time::sleep
                        std::thread::sleep(delay);
                    }
                }
            }
        }
    }

    fn should_run<'a>(&self, ctx: &ProcessingContext<'a>) -> bool {
        self.inner.should_run(ctx)
    }
}

/// Check if an error is retryable
///
/// Some errors (like validation failures) should not be retried,
/// while others (like transient I/O errors) can be.
fn is_retryable(err: &ProcessError) -> bool {
    match err {
        // Don't retry validation errors
        ProcessError::ValidationFailed(_) => false,
        ProcessError::EmptyContent => false,
        ProcessError::InvalidFormat(_) => false,
        ProcessError::PermissionDenied(_) => false,

        // Retry I/O errors (could be transient)
        ProcessError::FileError(_) => true,
        ProcessError::FileNotFound(_) => false, // Don't retry if file doesn't exist
        ProcessError::FileTooLarge { .. } => false,

        // Retry generic errors (could be transient)
        ProcessError::Generic(_) => true,
        ProcessError::SerializationError(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ChatContext;
    use crate::pipeline::processors::ValidationProcessor;
    use crate::structs::message::{InternalMessage, Role};
    use uuid::Uuid;

    #[test]
    fn test_retry_strategy_fixed_delay() {
        let strategy = RetryStrategy::FixedDelay {
            delay: Duration::from_millis(100),
            max_retries: 3,
        };

        assert_eq!(strategy.get_delay(0), Some(Duration::from_millis(100)));
        assert_eq!(strategy.get_delay(1), Some(Duration::from_millis(100)));
        assert_eq!(strategy.get_delay(2), Some(Duration::from_millis(100)));
        assert_eq!(strategy.get_delay(3), None);
        assert_eq!(strategy.max_retries(), 3);
    }

    #[test]
    fn test_retry_strategy_exponential_backoff() {
        let strategy = RetryStrategy::ExponentialBackoff {
            initial_delay: Duration::from_millis(100),
            multiplier: 2.0,
            max_delay: Duration::from_secs(1),
            max_retries: 4,
        };

        assert_eq!(strategy.get_delay(0), Some(Duration::from_millis(100)));
        assert_eq!(strategy.get_delay(1), Some(Duration::from_millis(200)));
        assert_eq!(strategy.get_delay(2), Some(Duration::from_millis(400)));
        assert_eq!(strategy.get_delay(3), Some(Duration::from_millis(800)));
        assert_eq!(strategy.get_delay(4), None);
    }

    #[test]
    fn test_retry_strategy_linear_backoff() {
        let strategy = RetryStrategy::LinearBackoff {
            initial_delay: Duration::from_millis(100),
            increment: Duration::from_millis(50),
            max_retries: 3,
        };

        assert_eq!(strategy.get_delay(0), Some(Duration::from_millis(100)));
        assert_eq!(strategy.get_delay(1), Some(Duration::from_millis(150)));
        assert_eq!(strategy.get_delay(2), Some(Duration::from_millis(200)));
        assert_eq!(strategy.get_delay(3), None);
    }

    #[test]
    fn test_retry_processor_success_first_try() {
        let mut ctx =
            ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "assistant".to_string());
        let message = InternalMessage::text(Role::User, "test".to_string());
        let mut processing_ctx = ProcessingContext::new(message, &mut ctx);

        let inner = Box::new(ValidationProcessor::new());
        let processor = RetryProcessor::with_default_strategy(inner);

        let result = processor.process(&mut processing_ctx);
        assert!(result.is_ok());
        assert!(matches!(result.unwrap(), ProcessResult::Continue));

        // Should not have retry metadata
        assert!(
            processing_ctx
                .metadata
                .get("validation_retry_count")
                .is_none()
        );
    }

    #[test]
    fn test_is_retryable() {
        // Non-retryable errors
        assert!(!is_retryable(&ProcessError::ValidationFailed(
            "test".to_string()
        )));
        assert!(!is_retryable(&ProcessError::EmptyContent));
        assert!(!is_retryable(&ProcessError::InvalidFormat(
            "test".to_string()
        )));
        assert!(!is_retryable(&ProcessError::PermissionDenied(
            "test".to_string()
        )));
        assert!(!is_retryable(&ProcessError::FileNotFound(
            "test.txt".to_string()
        )));

        // Retryable errors
        assert!(is_retryable(&ProcessError::Generic(
            "transient error".to_string()
        )));
    }

    #[test]
    fn test_default_strategy() {
        let strategy = RetryStrategy::default();
        match strategy {
            RetryStrategy::ExponentialBackoff { max_retries, .. } => {
                assert_eq!(max_retries, 3);
            }
            _ => panic!("Default strategy should be ExponentialBackoff"),
        }
    }
}
