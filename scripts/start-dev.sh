#!/bin/bash
# Start Copilot Agent development environment
# This script starts both the Agent Server and the Tauri App

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Copilot Agent Development Launcher${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

PROJECT_ROOT="$HOME/workspace/copilot_client_app"
AGENT_DIR="$PROJECT_ROOT/crates/copilot-agent"

# Check if Agent Server binary exists
if [ ! -f "$AGENT_DIR/target/release/copilot-agent-server" ]; then
    echo -e "${YELLOW}Building Agent Server...${NC}"
    cd "$AGENT_DIR"
    cargo build --release
fi

# Function to cleanup processes on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    if [ -n "$AGENT_PID" ]; then
        kill $AGENT_PID 2>/dev/null || true
    fi
    exit 0
}

trap cleanup INT TERM

echo -e "${GREEN}1. Starting Agent Server on port 8081...${NC}"
cd "$AGENT_DIR"
./target/release/copilot-agent-server --port 8081 &
AGENT_PID=$!
echo "   Agent Server PID: $AGENT_PID"

# Wait for Agent Server to be ready
echo "   Waiting for Agent Server to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:8081/api/v1/health >/dev/null 2>&1; then
        echo -e "   ${GREEN}✓ Agent Server ready${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "   ${YELLOW}⚠ Agent Server timeout, continuing anyway...${NC}"
    fi
done

echo ""
echo -e "${GREEN}2. Starting Tauri App...${NC}"
cd "$PROJECT_ROOT"
echo "   npm run tauri dev"
echo ""

# Start Tauri app (this will block until it exits)
npm run tauri dev

# Cleanup
cleanup
