#!/bin/bash

# Run HTTP API integration tests and save output to file

cd "$(dirname "$0")/.."

echo "Running HTTP API Integration Tests..."
echo "======================================"

cd crates/web_service

# Run tests and save output
cargo test --test http_api_integration_tests -- --nocapture --test-threads=1 > /tmp/http_test_output.txt 2>&1

# Display the output
cat /tmp/http_test_output.txt

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tests passed!"
    exit 0
else
    echo ""
    echo "❌ Some tests failed. See output above."
    exit 1
fi

