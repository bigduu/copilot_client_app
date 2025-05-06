# OpenAI-Style Completion API Interaction Rules

You are an expert AI programming assistant interacting with Large Language Models (LLMs) that follow an API style similar to OpenAI's Completion or Chat Completion endpoints. This applies whether you are making direct HTTP requests or using a client library.

**Core Principles:**

*   **API Documentation:** Always refer to the specific LLM provider's API documentation for the most accurate and up-to-date details on endpoints, parameters, rate limits, and authentication.
*   **Security:**
    *   **API Keys:** Never hardcode API keys directly in the source code. Use environment variables, secure configuration files (not checked into version control), or a secure secret management system.
    *   **Input Sanitization:** If user-provided input is part of the prompt, sanitize it to prevent prompt injection or other security vulnerabilities.
*   **Error Handling:**
    *   Implement robust error handling for network issues, API errors (e.g., 4xx, 5xx status codes), and unexpected response formats.
    *   Check for error objects or messages within the API response body.
    *   Implement retries with exponential backoff for transient errors (e.g., rate limits, temporary server issues), respecting the API provider's guidelines.
*   **Efficiency:**
    *   **Token Usage:** Be mindful of token limits for both prompts and completions. Optimize prompts to be concise yet effective.
    *   **Streaming:** If the API supports streaming (Server-Sent Events - SSE), use it for long-running requests or when displaying responses incrementally to improve user experience.
    *   **Request Batching:** If making multiple independent requests, consider if the API supports batching to reduce overhead, but be mindful of overall request size and processing time.

**Request Construction:**

*   **Model Selection:** Choose the appropriate model based on the task requirements (e.g., text generation, code completion, instruction following) and cost/performance trade-offs.
*   **Prompt Engineering:**
    *   Craft clear, specific, and unambiguous prompts.
    *   Provide context and examples (few-shot prompting) if it improves results.
    *   Clearly define the desired output format if necessary.
*   **Parameters:**
    *   **`temperature`:** Adjust for creativity vs. determinism. Lower values (e.g., 0.2) for factual/deterministic outputs, higher values (e.g., 0.8) for more creative outputs.
    *   **`max_tokens` (or `max_length`):** Set appropriately to control the length of the generated response and manage costs.
    *   **`top_p` (nucleus sampling):** Consider using as an alternative to temperature.
    *   **`stop` sequences:** Specify sequences that, when generated, will cause the model to stop.
    *   **`presence_penalty` / `frequency_penalty`:** Use to discourage repetition if needed.
    *   **User Identifier:** If the API supports it, pass a unique user identifier to help the provider monitor for and prevent abuse.
*   **Chat Completions (if applicable):**
    *   Structure conversations using roles (`system`, `user`, `assistant`).
    *   The `system` message can set the overall behavior/persona of the assistant.
    *   Maintain conversation history appropriately for context.

**Response Handling:**

*   **Parsing:** Safely parse the JSON response.
*   **Content Extraction:** Extract the relevant generated text from the response structure (e.g., `choices[0].text` or `choices[0].message.content`).
*   **Usage Information:** If provided, log or monitor token usage (`prompt_tokens`, `completion_tokens`, `total_tokens`) for cost management and analytics.
*   **Finish Reason:** Check the `finish_reason` (e.g., `stop`, `length`, `content_filter`) to understand why the generation ended.

**Data Privacy:**

*   Be aware of the data privacy implications of sending data to third-party LLM APIs.
*   Avoid sending sensitive or personally identifiable information (PII) unless absolutely necessary and permitted by the API provider's terms of service and relevant regulations.

**Code Implementation (General):**

*   **Asynchronous Operations:** Use `async/await` for all network requests.
*   **HTTP Client:** Use a reliable HTTP client library (e.g., `reqwest` in Rust, `axios` or `fetch` in JavaScript/TypeScript).
    *   Set appropriate headers (e.g., `Authorization: Bearer YOUR_API_KEY`, `Content-Type: application/json`).
*   **Type Safety:** If using TypeScript or Rust, define interfaces/structs for request and response payloads.

By following these guidelines, you can interact with OpenAI-style completion APIs effectively, securely, and efficiently.
