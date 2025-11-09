use actix_web_lab::sse;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

/// Event broadcaster for Signal-Pull SSE architecture
/// Manages SSE connections and broadcasts events to subscribed clients
#[derive(Clone)]
pub struct EventBroadcaster {
    /// Map of context_id -> list of SSE senders
    subscribers: Arc<RwLock<HashMap<Uuid, Vec<mpsc::Sender<sse::Event>>>>>,
}

impl EventBroadcaster {
    pub fn new() -> Self {
        Self {
            subscribers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Subscribe to events for a specific context
    /// Returns a receiver that will receive SSE events
    pub async fn subscribe(&self, context_id: Uuid) -> mpsc::Receiver<sse::Event> {
        let (tx, rx) = mpsc::channel::<sse::Event>(32);
        
        let mut subscribers = self.subscribers.write().await;
        subscribers
            .entry(context_id)
            .or_insert_with(Vec::new)
            .push(tx);
        
        tracing::debug!(
            context_id = %context_id,
            subscriber_count = subscribers.get(&context_id).map(|v| v.len()).unwrap_or(0),
            "New SSE subscriber added"
        );
        
        rx
    }

    /// Broadcast an event to all subscribers of a context
    pub async fn broadcast(&self, context_id: Uuid, event: sse::Event) {
        let mut subscribers = self.subscribers.write().await;
        
        if let Some(senders) = subscribers.get_mut(&context_id) {
            // Remove disconnected clients and send to active ones
            senders.retain(|sender| {
                sender.try_send(event.clone()).is_ok()
            });
            
            tracing::debug!(
                context_id = %context_id,
                active_subscribers = senders.len(),
                "Event broadcasted to subscribers"
            );
            
            // Clean up if no subscribers left
            if senders.is_empty() {
                subscribers.remove(&context_id);
            }
        }
    }

    /// Get the number of active subscribers for a context
    pub async fn subscriber_count(&self, context_id: Uuid) -> usize {
        let subscribers = self.subscribers.read().await;
        subscribers
            .get(&context_id)
            .map(|v| v.len())
            .unwrap_or(0)
    }
}

impl Default for EventBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

