#!/bin/bash

# Test script for internal module functionality

echo "=== Testing Internal Module Design ==="

echo "1. Testing external build (without internal feature)..."
cd src-tauri
cargo check 2>&1 | head -20

echo -e "\n2. Testing internal build (with internal feature)..."
cargo check --features internal 2>&1 | head -20

echo -e "\n3. Checking internal module structure..."
echo "Internal module files:"
find src/internal -name "*.rs" 2>/dev/null | sort

echo -e "\n4. Checking feature flag usage..."
echo "Files with #[cfg(feature = \"internal\")]:"
grep -r "#\[cfg(feature = \"internal\")\]" src/ 2>/dev/null | cut -d: -f1 | sort | uniq

echo -e "\n5. Checking auto-registration usage..."
echo "Files with auto_register macros:"
grep -r "auto_register_" src/ 2>/dev/null | cut -d: -f1 | sort | uniq

echo -e "\n=== Test Complete ==="
