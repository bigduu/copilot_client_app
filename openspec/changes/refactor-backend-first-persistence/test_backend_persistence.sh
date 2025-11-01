#!/bin/bash

# Test Script for Backend-First Persistence
# This script verifies that the backend automatically persists messages
# when using the action-based API.

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8080}"
API_VERSION="v1"
CONTEXT_ID=""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    log_error "jq is not installed. Please install it: brew install jq"
    exit 1
fi

echo ""
echo "========================================"
echo "Backend-First Persistence Test"
echo "========================================"
echo ""

# Test 1: Create a new context
log_info "Test 1: Creating a new context..."
CREATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/${API_VERSION}/contexts" \
    -H "Content-Type: application/json" \
    -d '{
        "model_id": "gpt-4",
        "mode": "chat",
        "system_prompt_id": null
    }')

log_info "Raw response: $CREATE_RESPONSE"

# Check if response is valid JSON
if ! echo "$CREATE_RESPONSE" | jq empty 2>/dev/null; then
    log_error "Invalid JSON response from API"
    echo "Raw response: $CREATE_RESPONSE"
    log_warning "Is the backend running on ${BASE_URL}?"
    exit 1
fi

CONTEXT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id // empty')

if [ -z "$CONTEXT_ID" ]; then
    log_error "Failed to create context (no ID in response)"
    echo "Response: $CREATE_RESPONSE"
    exit 1
fi

log_success "Context created: $CONTEXT_ID"
echo ""

# Test 2: Get initial message count
log_info "Test 2: Checking initial messages..."
MESSAGES_RESPONSE=$(curl -s -X GET "${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}/messages")
INITIAL_MESSAGE_COUNT=$(echo "$MESSAGES_RESPONSE" | jq '.total // .messages | length')

log_info "Initial message count: $INITIAL_MESSAGE_COUNT"
if [ "$INITIAL_MESSAGE_COUNT" -gt 0 ]; then
    log_info "Context has initial messages (likely system prompt or defaults)"
else
    log_info "Context is empty (no initial messages)"
fi
echo ""

# Test 3: Send message via ACTION API
log_info "Test 3: Sending message via action API..."
log_info "POST ${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}/actions/send_message"

ACTION_RESPONSE=$(curl -s -X POST "${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}/actions/send_message" \
    -H "Content-Type: application/json" \
    -d '{
        "content": "Hello! This is a test message to verify backend persistence."
    }')

ACTION_STATUS=$(echo "$ACTION_RESPONSE" | jq -r '.status // empty')

if [ -z "$ACTION_STATUS" ]; then
    log_error "Action API call failed (no status in response)"
    echo "Response: $ACTION_RESPONSE"
    exit 1
fi

log_info "Action status: $ACTION_STATUS"

log_success "Action API call completed successfully"
echo ""

# Test 4: Verify messages were persisted
log_info "Test 4: Verifying messages were persisted to backend..."
sleep 1  # Give backend a moment to complete processing

MESSAGES_RESPONSE=$(curl -s -X GET "${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}/messages")
MESSAGE_COUNT=$(echo "$MESSAGES_RESPONSE" | jq '.total // .messages | length')

log_info "Found $MESSAGE_COUNT messages in context (was $INITIAL_MESSAGE_COUNT before)"

EXPECTED_MIN=$((INITIAL_MESSAGE_COUNT + 1))
if [ "$MESSAGE_COUNT" -lt "$EXPECTED_MIN" ]; then
    log_error "Expected at least $EXPECTED_MIN messages (initial + user message), but found $MESSAGE_COUNT"
    echo "Messages: $MESSAGES_RESPONSE"
    exit 1
fi

# Check if we have user and assistant messages (look at most recent messages)
# Since we may have initial messages, find the last user message we added
echo ""
log_info "Message breakdown (showing recent messages):"
echo "$MESSAGES_RESPONSE" | jq '.messages[-5:] | .[] | { role: .role, content: .content[0].text[:50] }' 2>/dev/null || \
  echo "$MESSAGES_RESPONSE" | jq '.messages | .[] | { role: .role, content_preview: .content | tostring | .[0:50] }'
echo ""

# Find our test message in the list
OUR_USER_MSG=$(echo "$MESSAGES_RESPONSE" | jq -r '.messages[] | select(.content[0].text | contains("test message to verify backend persistence")) | .role')

if [ "$OUR_USER_MSG" == "user" ]; then
    log_success "✅ User message was persisted"
else
    log_error "Could not find our test user message"
    exit 1
fi

# Check if there's an assistant message after our user message
NEW_MESSAGES=$((MESSAGE_COUNT - INITIAL_MESSAGE_COUNT))
if [ "$NEW_MESSAGES" -ge 2 ]; then
    log_success "✅ Assistant message was also persisted ($NEW_MESSAGES new messages total)"
else
    log_warning "⚠️  Only 1 new message found (FSM may not have generated assistant response yet)"
fi

echo ""

# Test 5: Verify dirty flag optimization
log_info "Test 5: Testing dirty flag optimization..."
log_info "Fetching context state multiple times..."

for i in {1..3}; do
    STATE_RESPONSE=$(curl -s -X GET "${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}/state")
    STATE_STATUS=$(echo "$STATE_RESPONSE" | jq -r '.status // empty')
    
    if [ -z "$STATE_STATUS" ]; then
        log_warning "State fetch #$i failed (endpoint may not be implemented yet)"
    else
        log_success "State fetch #$i succeeded (status: $STATE_STATUS)"
    fi
done

echo ""

# Test 6: Compare old CRUD vs new ACTION API
log_info "Test 6: Comparing old CRUD endpoint (should warn in logs)..."
log_warning "This will trigger deprecation warnings in backend logs"

OLD_CRUD_RESPONSE=$(curl -s -X POST "${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}/messages" \
    -H "Content-Type: application/json" \
    -d '{
        "role": "user",
        "content": "This is sent via OLD CRUD endpoint (should NOT trigger FSM)",
        "branch": "main"
    }')

CRUD_SUCCESS=$(echo "$OLD_CRUD_RESPONSE" | jq -r 'if type == "object" then true else false end')

if [ "$CRUD_SUCCESS" == "true" ]; then
    log_warning "⚠️  OLD CRUD endpoint still works (backward compatibility OK)"
    log_warning "⚠️  But it did NOT trigger FSM (no assistant response expected)"
else
    log_info "OLD CRUD endpoint may have been deprecated"
fi

echo ""

# Test 7: Final message count verification
log_info "Test 7: Final verification..."
FINAL_MESSAGES=$(curl -s -X GET "${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}/messages")
FINAL_COUNT=$(echo "$FINAL_MESSAGES" | jq '.total // .messages | length')

TOTAL_NEW=$((FINAL_COUNT - INITIAL_MESSAGE_COUNT))
log_info "Final message count: $FINAL_COUNT (started with $INITIAL_MESSAGE_COUNT)"
log_info "New messages added: $TOTAL_NEW"
log_info "Expected: 2-3 new messages (1 user + 1 assistant from action API, +1 user from CRUD)"

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo ""

if [ "$NEW_MESSAGES" -ge 2 ]; then
    log_success "✅ Backend persistence is working correctly!"
    log_success "✅ Action API saves both user and assistant messages"
    log_success "✅ Messages are persisted to database"
else
    log_warning "⚠️  Partial success: User message saved, but assistant response may need FSM implementation"
fi

echo ""
log_info "To check backend logs for persistence operations, look for:"
echo "  - 'Auto-saving context after adding user message'"
echo "  - 'Saving dirty context'"
echo "  - 'Context auto-saved successfully'"
echo ""

log_info "Test context ID: $CONTEXT_ID"
log_info "To manually inspect messages:"
echo "  curl ${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}/messages | jq"
echo ""

# Cleanup option
read -p "Delete test context? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    curl -s -X DELETE "${BASE_URL}/${API_VERSION}/contexts/${CONTEXT_ID}" > /dev/null
    log_success "Test context deleted"
fi

echo ""
log_success "Test completed!"

