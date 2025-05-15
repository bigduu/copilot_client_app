/// Extract a complete SSE message from the buffer
/// Returns (message, remaining_buffer) if a complete message is found
pub fn extract_sse_message(buffer: &str) -> Option<(String, &str)> {
    // Split on double newlines to separate messages
    if let Some(idx) = buffer.find("\n\n") {
        let (message, remaining) = buffer.split_at(idx);

        // Remove "data: " prefix if present
        let message = message
            .trim()
            .strip_prefix("data: ")
            .unwrap_or(message)
            .trim();

        // Return remaining buffer without the leading newlines
        Some((message.to_string(), remaining.trim_start_matches('\n')))
    } else {
        None
    }
}
