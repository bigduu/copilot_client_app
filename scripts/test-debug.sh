#!/bin/bash

# Debug Mode Test Script

echo "🧪 Testing Debug Mode"
echo "===================="

cd ~/workspace/copilot_client_app

# Test 1: Server help shows debug option
echo -e "\n📋 Test 1: Server --help"
./target/debug/copilot-agent-server --help | grep -E "(debug|port)"

# Test 2: CLI help shows debug option
echo -e "\n📋 Test 2: CLI --help"
./target/debug/copilot-agent-cli --help | grep -E "(debug|DEBUG)"

# Test 3: Start server in debug mode (background)
echo -e "\n📋 Test 3: Server debug mode"
DEBUG=true ./target/debug/copilot-agent-server --port 18080 &
SERVER_PID=$!
sleep 3

# Test 4: Test CLI with debug mode
echo -e "\n📋 Test 4: CLI debug mode"
echo "Testing with --debug flag..."
./target/debug/copilot-agent-cli --server-url http://localhost:18080 --debug send "test" 2>&1 | head -20

# Cleanup
echo -e "\n🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo -e "\n✅ Debug mode tests completed!"
