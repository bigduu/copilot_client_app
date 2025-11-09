#!/bin/bash

# Script to run HTTP API integration tests
# Usage: ./scripts/run_integration_tests.sh

set -e

echo "🧪 Running HTTP API Integration Tests"
echo "======================================"
echo ""

cd "$(dirname "$0")/../crates/web_service"

echo "📍 Working directory: $(pwd)"
echo ""

echo "🔨 Building tests..."
cargo test --test http_api_integration_tests --no-run

echo ""
echo "🚀 Running tests..."
echo ""

cargo test --test http_api_integration_tests -- --nocapture --test-threads=1

echo ""
echo "✅ Tests completed!"

