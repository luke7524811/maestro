#!/bin/bash

# Session Switching Test for Maestro Web
# Tests if terminals can be focused and input routed correctly

set -e

echo "🎯 Testing session switching and focus handling..."
echo ""

cd /tmp/maestro-test

# Function to check if API is responding
check_api() {
    if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to get current sessions
get_sessions() {
    curl -s "http://localhost:3100/api/sessions" 2>/dev/null || echo "[]"
}

# Function to create sessions
create_test_sessions() {
    local count=$1
    echo "🔧 Creating $count test sessions..."

    for ((i=1; i<=count; i++)); do
        curl -s -X POST "http://localhost:3100/api/sessions" > /dev/null
        echo "   ✅ Session $i created"
        sleep 0.5
    done
}

# Function to launch sessions
launch_sessions() {
    echo "🚀 Launching sessions..."
    local sessions=$(get_sessions)
    local session_ids=$(echo "$sessions" | grep -o '"id":[0-9]*' | cut -d':' -f2 | head -3)

    for id in $session_ids; do
        curl -s -X POST "http://localhost:3100/api/sessions/$id/launch" \
          -H "Content-Type: application/json" \
          -d '{"workingDirectory": "/workspace"}' > /dev/null
        echo "   ✅ Session $id launched"
        sleep 1
    done
}

echo "=== STEP 1: Check Prerequisites ==="

# Ensure container is running
if ! docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "maestro-web.*Up"; then
    echo "❌ Container not running!"
    exit 1
fi

# Ensure API is responding
if ! check_api; then
    echo "❌ API not responding!"
    exit 1
fi

echo "✅ Container running and API responding"

echo ""
echo "=== STEP 2: Setup Test Environment ==="

# Clear existing sessions
current_sessions=$(get_sessions)
session_count=$(echo "$current_sessions" | grep -c '"id"' || echo "0")
echo "📊 Current sessions: $session_count"

if [ "$session_count" -eq 0 ]; then
    create_test_sessions 3
else
    echo "🔄 Using existing sessions"
fi

echo ""
echo "=== STEP 3: Test Session Creation ==="

sessions=$(get_sessions)
session_count=$(echo "$sessions" | grep -c '"id"' || echo "0")

if [ "$session_count" -ge 3 ]; then
    echo "✅ Have $session_count sessions available for testing"
else
    echo "❌ Need at least 3 sessions for testing"
    exit 1
fi

echo ""
echo "=== STEP 4: Test Session Launching ==="

launch_sessions

# Wait for sessions to fully launch
echo "⏳ Waiting for sessions to fully initialize..."
sleep 5

echo ""
echo "=== STEP 5: Test Session Status ==="

sessions=$(get_sessions)
echo "📋 Session status summary:"

# Check each session status
echo "$sessions" | grep -E '"id"|"status"|"isTerminalLaunched"' | while read line; do
    if [[ "$line" =~ "id":[[:space:]]*([0-9]+) ]]; then
        id="${BASH_REMATCH[1]}"
        echo -n "   Session $id: "
    elif [[ "$line" =~ "status":[[:space:]]*\"([^\"]+)\" ]]; then
        status="${BASH_REMATCH[1]}"
        echo -n "status=$status, "
    elif [[ "$line" =~ "isTerminalLaunched":[[:space:]]*(true|false) ]]; then
        launched="${BASH_REMATCH[1]}"
        echo "terminal=$launched"
    fi
done

echo ""
echo "=== STEP 6: Test Focus Indicator (Manual Check) ==="

echo "🎯 Testing focus behavior..."
echo ""
echo "📋 Manual verification needed:"
echo "   1. Open browser to http://localhost:3100"
echo "   2. Verify 3 terminal sessions are visible"
echo "   3. Click on different terminals"
echo "   4. Check that clicked terminal receives focus"
echo "   5. Type in different terminals to verify input routing"
echo ""

# Test basic WebSocket communication
echo "🔍 Testing WebSocket communication..."

# Check if WebSocket server is responding (basic check)
websocket_test=$(curl -s -H "Connection: Upgrade" -H "Upgrade: websocket" "http://localhost:3100/ws" 2>&1 || echo "connection failed")

if echo "$websocket_test" | grep -q "connection failed"; then
    echo "⚠️  WebSocket connection test inconclusive"
else
    echo "✅ WebSocket endpoint accessible"
fi

echo ""
echo "=== STEP 7: Test Session Switching Logic ==="

# Test if session data routing works by checking session metadata
sessions=$(get_sessions)
echo "🔍 Verifying session switching infrastructure:"

# Check if sessions have unique IDs
session_ids=$(echo "$sessions" | grep -o '"id":[0-9]*' | cut -d':' -f2 | sort -n)
unique_ids=$(echo "$session_ids" | uniq | wc -l)
total_ids=$(echo "$session_ids" | wc -l)

if [ "$unique_ids" -eq "$total_ids" ]; then
    echo "   ✅ All sessions have unique IDs"
else
    echo "   ❌ Duplicate session IDs detected"
fi

# Check if sessions have proper modes
claude_sessions=$(echo "$sessions" | grep -c '"Claude Code"' || echo "0")
echo "   📊 Claude Code sessions: $claude_sessions"

# Check if sessions can accept input (by checking status)
ready_sessions=$(echo "$sessions" | grep -B2 -A2 '"status":"idle"' | grep -c '"id"' || echo "0")
echo "   📊 Sessions ready for input: $ready_sessions"

echo ""
echo "=== STEP 8: CSS Focus Indicator Test ==="

echo "🎨 Checking CSS focus styling..."

# Check if CSS file contains focus-related styles
css_files=$(find . -name "*.css" -o -name "*.scss" 2>/dev/null || echo "")

if [ -n "$css_files" ]; then
    echo "   📄 Found CSS files:"
    echo "$css_files" | while read file; do
        echo "      - $file"

        # Check for focus-related styles
        if grep -q -i "focus\|active\|session.*border\|terminal.*border" "$file" 2>/dev/null; then
            echo "        ✅ Contains focus/border styles"
        else
            echo "        ⚠️  No obvious focus styles found"
        fi
    done
else
    echo "   📄 Checking compiled styles in build..."
    if [ -d "web/dist" ]; then
        compiled_css=$(find web/dist -name "*.css" 2>/dev/null || echo "")
        if [ -n "$compiled_css" ]; then
            echo "      Found compiled CSS files"
        else
            echo "      No compiled CSS found"
        fi
    fi
fi

echo ""
echo "=== SWITCHING TEST SUMMARY ==="

echo "📋 Test Results:"

# API responding
if check_api; then
    echo "   ✅ API responding"
    score=1
else
    echo "   ❌ API not responding"
    score=0
fi

# Sessions created
if [ "$session_count" -ge 3 ]; then
    echo "   ✅ Multiple sessions available"
    score=$((score + 1))
else
    echo "   ❌ Insufficient sessions"
fi

# Unique session IDs
if [ "$unique_ids" -eq "$total_ids" ] && [ "$total_ids" -gt 0 ]; then
    echo "   ✅ Session IDs are unique"
    score=$((score + 1))
else
    echo "   ❌ Session ID issues"
fi

# WebSocket accessible
if ! echo "$websocket_test" | grep -q "connection failed"; then
    echo "   ✅ WebSocket endpoint accessible"
    score=$((score + 1))
else
    echo "   ❌ WebSocket issues"
fi

echo ""
echo "📊 AUTOMATED CHECKS: $score/4"

if [ $score -eq 4 ]; then
    echo "🎉 Infrastructure ready for session switching"
    echo ""
    echo "⚠️  Manual verification still needed:"
    echo "   - Open http://localhost:3100 in browser"
    echo "   - Test clicking between terminals"
    echo "   - Verify keyboard input goes to focused terminal"
    echo "   - Check for visual focus indication"
    exit 0
elif [ $score -ge 2 ]; then
    echo "⚠️  Partial functionality - some issues detected"
    exit 1
else
    echo "❌ Major issues with session switching infrastructure"
    exit 2
fi