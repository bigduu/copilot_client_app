## 1. Implementation
- [x] 1.1 Add a single source of truth utility for backend base URL (default from `VITE_BACKEND_BASE_URL`, override from local storage)
- [x] 1.2 Add "Backend API Base URL" editor to System Settings (input + save + reset-to-default)
- [x] 1.3 Replace hardcoded `http://127.0.0.1:8080/v1` usages across services/hooks/components with the utility
- [x] 1.4 Ensure OpenAI client and any cached service instances react correctly to base URL changes (recreate client as needed)
- [x] 1.5 Add/adjust tests for URL normalization/persistence and at least one service using the configured base URL
