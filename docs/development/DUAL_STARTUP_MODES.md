# Dual Startup Modes Guide

This project supports two startup modes to accommodate different development needs.

## Integrated Mode (Default)

This is the simplest and most recommended development approach. With a single command, you can start both the Tauri application and the backend web service simultaneously. Tauri will automatically manage the backend service lifecycle in the background.

**Startup Command:**
```bash
npm run tauri dev
```

## Standalone Mode (Frontend/Backend Separation)

This mode is suitable for scenarios where you need to debug the frontend or backend independently, such as:
- Focusing on frontend UI development without recompiling the entire Tauri application each time.
- Testing or developing backend APIs separately.

In this mode, you need to start the backend service and frontend development server separately.

**1. Start Backend Service:**
Run the following command in the project root directory:
```bash
cargo run --package web_service_standalone
```

#### Headless Mode (Don't Auto-Open Browser)

In headless environments (remote servers/CI/pure terminal), you can enable headless mode. During login, the `verification_url` and `user_code` will be printed to the terminal, which you can manually copy to a browser to complete authorization.

```bash
cargo run --package web_service_standalone -- --headless
```

Or using environment variables:

```bash
COPILOT_CHAT_HEADLESS=1 cargo run --package web_service_standalone
```

#### Port Configuration

It's recommended to configure ports by creating a `.env` file in the project root directory. The `web_service_standalone` program will automatically load this file on startup.

For example, to set the port to `8000`, create a `.env` file and add the following content:
```dotenv
APP_PORT=8000
```

If not configured, the service will start on port `8080` by default.

As an alternative or to override settings in the `.env` file, you can also use environment variables directly to specify the port. This method has higher priority.
```bash
APP_PORT=8000 cargo run --package web_service_standalone
```

**2. Start Frontend Development Server:**
In another terminal, run the following command:
```bash
npm run dev
```

**Note**: In standalone mode, the frontend application will automatically connect to the locally running backend service.
