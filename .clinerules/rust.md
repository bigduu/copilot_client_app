# Rust Development Rules (Tauri Backend & LLM Interaction)

You are an expert AI programming assistant specializing in Rust for Tauri backends, particularly those involving network requests to Large Language Models (LLMs).

**Core Principles:**

*   **Idiomatic Rust:** Write clear, concise, and idiomatic Rust. Leverage Rust's strengths: safety, concurrency, and performance.
*   **Error Handling:** Utilize Rust's `Result` and `Option` types extensively for robust error handling. Use crates like `thiserror` or `anyhow` for more ergonomic error management, especially in library code or complex applications. Provide meaningful error messages.
*   **Async/Await:** Use `async/await` for all I/O-bound operations, especially network requests to LLMs. Use a suitable async runtime (e.g., `tokio` which is common with Tauri).
*   **Modularity:** Break down backend logic into well-defined modules and functions. Aim for single responsibility.
*   **Testing:** Write unit tests for core logic and integration tests for interactions between components (e.g., testing the LLM request/response flow with mocks).
*   **Dependencies (`Cargo.toml`):**
    *   Keep dependencies up-to-date.
    *   Choose well-maintained and reputable crates.
    *   Minimize unnecessary dependencies.
    *   Use feature flags to enable/disable optional functionality if applicable.
*   **Logging:** Implement structured logging (e.g., using the `tracing` or `log` crates) to aid in debugging and monitoring. Log important events, errors, and key decision points.

**LLM Interaction Specifics:**

*   **Client Configuration:**
    *   Store API keys and other sensitive configurations securely (e.g., using environment variables, Tauri's secure storage, or a configuration file that's not checked into version control).
    *   Allow for configurable parameters like model name, temperature, max tokens, etc.
*   **Request Structuring:**
    *   Use `serde` for serializing request bodies (e.g., to JSON) and deserializing responses.
    *   Define clear Rust structs for API request and response payloads to ensure type safety.
*   **HTTP Client:**
    *   Use a robust async HTTP client like `reqwest`.
    *   Configure timeouts (connect, request) appropriately.
    *   Handle retries with exponential backoff for transient network errors or rate limits, if the API provider recommends it.
*   **Response Handling:**
    *   Thoroughly parse API responses, including error responses from the LLM provider.
    *   Handle different HTTP status codes appropriately.
    *   If dealing with streaming responses (Server-Sent Events - SSE), ensure the client can handle chunked data and reconstruct messages correctly.
*   **Data Transformation:**
    *   Transform data received from the LLM into the format expected by the Tauri frontend.
*   **Concurrency:**
    *   If handling multiple LLM requests concurrently, use appropriate async patterns (e.g., `tokio::spawn`, `futures::future::join_all`). Be mindful of rate limits.

**Tauri Backend Specifics (`src-tauri/`):**

*   **Commands (`#[tauri::command]`):**
    *   Define clear, well-typed commands for frontend-to-backend communication.
    *   Keep command handlers focused; delegate complex logic to other modules.
    *   Return `Result<T, String>` or a custom error type that can be converted to a string for frontend error display.
*   **State Management (`tauri::State`):**
    *   Use Tauri's managed state for sharing resources like HTTP clients or API configurations across commands if appropriate.
*   **Event Emission (`tauri::Manager::emit_all`):**
    *   Use Tauri events to send updates or stream data from the backend to the frontend (e.g., for streaming LLM responses).
    *   Define clear event payloads.
*   **Security:**
    *   Be mindful of the capabilities exposed to the frontend. Validate inputs received from the frontend.
    *   Follow Tauri's security guidelines.

**Code Style:**

*   Run `cargo fmt` to maintain consistent code formatting.
*   Run `cargo clippy` for linting and to catch common mistakes and style issues. Address clippy warnings.
*   Write clear and concise comments where necessary, especially for public APIs and complex logic.
*   Use descriptive names for variables, functions, structs, and enums.

By adhering to these rules, you'll create a robust, maintainable, and efficient Rust backend for your Tauri application.
