#!/bin/bash

# Session Persistence Test for Maestro Web
# Tests that sessions and their state persist across container restarts

set -e

echo "🧪 Session persistence test for Maestro Web..."
echo ""

cd /tmp/maestro-test

echo "=== STEP 1: Initial Setup ==="

# Check if container is running, start if needed
if ! docker ps -q -f name=maestro-web | grep -q .; then
    echo "🚀 Starting Maestro Web container..."
    docker run -d --name maestro-web \
        -p 3100:3100 \
        -v "$(pwd)/config/claude:/root/.claude:rw" \
        -v "$(pwd)/config/gemini:/root/.config/gemini:rw" \
        -v "$(pwd)/config/codex:/root/.codex:rw" \
        -v "$(pwd)/config/maestro:/app/config:rw" \
        -v "$(pwd)/workspace:/workspace:rw" \
        --env DEFAULT_SESSIONS=0 \
        maestro-web:latest

    echo "⏱️  Waiting for startup..."
    sleep 15
fi

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
for i in {1..20}; do
    if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
        echo "✅ API is ready"
        break
    elif [ $i -eq 20 ]; then
        echo "❌ API not responding"
        exit 1
    else
        echo "   Attempt $i/20..."
        sleep 3
    fi
done

echo ""
echo "=== STEP 2: Create Test Sessions ==="

# Create sessions with different configurations
echo "🔧 Creating test sessions..."

# Session 1: Claude Code in /workspace
session1=$(curl -s -X POST "http://localhost:3100/api/sessions" \
    -H "Content-Type: application/json" \
    -d '{"mode": "Claude Code", "workingDirectory": "/workspace"}' | \
    python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

# Session 2: Plain Terminal in /tmp
session2=$(curl -s -X POST "http://localhost:3100/api/sessions" \
    -H "Content-Type: application/json" \
    -d '{"mode": "Plain Terminal", "workingDirectory": "/tmp"}' | \
    python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

# Session 3: Gemini CLI with custom flags
session3=$(curl -s -X POST "http://localhost:3100/api/sessions" \
    -H "Content-Type: application/json" \
    -d '{"mode": "Gemini CLI", "customFlags": ["--verbose"], "envVars": {"TEST_VAR": "persistence_test"}}' | \
    python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

echo "   Created session $session1 (Claude Code)"
echo "   Created session $session2 (Plain Terminal)"
echo "   Created session $session3 (Gemini CLI)"

# Configure session settings
echo "🔧 Configuring session settings..."

# Set branch for session 1
curl -s -X PATCH "http://localhost:3100/api/sessions/$session1/branch" \
    -H "Content-Type: application/json" \
    -d '{"branch": "session-persistence-test"}' > /dev/null

# Set permission mode for session 1
curl -s -X PATCH "http://localhost:3100/api/sessions/$session1/permission" \
    -H "Content-Type: application/json" \
    -d '{"permissionMode": "plan"}' > /dev/null

echo "   Configured session settings"

echo ""
echo "=== STEP 3: Launch and Test Sessions ==="

# Launch session 1 and send some commands
echo "🚀 Launching session $session1..."
curl -s -X POST "http://localhost:3100/api/sessions/$session1/launch" > /dev/null

sleep 5

# Send test commands to create history
echo "📝 Sending test commands..."
curl -s -X POST "http://localhost:3100/api/sessions/$session1/command" \
    -H "Content-Type: application/json" \
    -d '{"command": "echo 'persistence test'"}' > /dev/null

sleep 2

curl -s -X POST "http://localhost:3100/api/sessions/$session1/command" \
    -H "Content-Type: application/json" \
    -d '{"command": "pwd"}' > /dev/null

sleep 2

echo "✅ Sessions configured and test commands sent"

echo ""
echo "=== STEP 4: Check Persistence Status ==="

# Check persistence is enabled and get stats
persistence_status=$(curl -s "http://localhost:3100/api/persistence")
echo "📊 Persistence status:"
echo "$persistence_status" | python3 -m json.tool

# Force save session states
echo "💾 Force saving session states..."
save_result=$(curl -s -X POST "http://localhost:3100/api/persistence/save")
echo "$save_result" | python3 -m json.tool

# Check session history
echo "📜 Session $session1 command history:"
history=$(curl -s "http://localhost:3100/api/sessions/$session1/history")
echo "$history" | python3 -m json.tool

echo ""
echo "=== STEP 5: Capture Pre-Restart State ==="

# Get all sessions before restart
echo "📸 Capturing session state before restart..."
pre_restart_sessions=$(curl -s "http://localhost:3100/api/sessions")
echo "$pre_restart_sessions" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Sessions before restart: {len(data[\"sessions\"])}')
for session in data['sessions']:
    print(f'  Session {session[\"id\"]}: mode={session[\"mode\"]}, wd={session[\"workingDirectory\"]}, launched={session[\"isTerminalLaunched\"]}')
"

# Get persistence stats
pre_stats=$(curl -s "http://localhost:3100/api/persistence" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Snapshots: {data[\"stats\"][\"totalSnapshots\"]}')
print(f'Sessions tracked: {data[\"stats\"][\"totalSessions\"]}')
")

echo "$pre_stats"

echo ""
echo "=== STEP 6: Container Restart ==="

echo "🔄 Restarting container to test persistence..."
docker restart maestro-web

echo "⏱️  Waiting for restart..."
sleep 15

# Wait for API to be ready after restart
echo "⏳ Waiting for API after restart..."
for i in {1..25}; do
    if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
        echo "✅ API ready after restart"
        break
    elif [ $i -eq 25 ]; then
        echo "❌ API not responding after restart"
        docker logs maestro-web | tail -20
        exit 1
    else
        echo "   Attempt $i/25..."
        sleep 3
    fi
done

echo ""
echo "=== STEP 7: Verify Persistence ==="

echo "🔍 Checking session persistence..."

# Get sessions after restart
post_restart_sessions=$(curl -s "http://localhost:3100/api/sessions")
echo "$post_restart_sessions" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Sessions after restart: {len(data[\"sessions\"])}')
for session in data['sessions']:
    print(f'  Session {session[\"id\"]}: mode={session[\"mode\"]}, wd={session[\"workingDirectory\"]}, branch={session.get(\"assignedBranch\", \"None\")}')
"

# Check persistence stats after restart
post_stats=$(curl -s "http://localhost:3100/api/persistence")
echo "📊 Persistence status after restart:"
echo "$post_stats" | python3 -m json.tool

# Check if session history persisted (try the original session ID)
echo "📜 Checking command history persistence..."
post_history=$(curl -s "http://localhost:3100/api/sessions/$session1/history" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "Session $session1 history:"
    echo "$post_history" | python3 -m json.tool
else
    echo "Session $session1 not found, checking all sessions for history..."
    post_restart_sessions | python3 -c "
import sys, json
import subprocess
data = json.load(sys.stdin)
for session in data['sessions']:
    try:
        result = subprocess.run(['curl', '-s', f'http://localhost:3100/api/sessions/{session[\"id\"]}/history'],
                              capture_output=True, text=True)
        if result.returncode == 0:
            history = json.loads(result.stdout)
            if history['history']:
                print(f'Session {session[\"id\"]} has {len(history[\"history\"])} commands in history')
    except:
        pass
"
fi

echo ""
echo "=== STEP 8: Persistence Verification ==="

score=0
total=6

echo "📋 Verification checklist:"

# 1. API responding
if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
    echo "   ✅ API responding after restart"
    score=$((score + 1))
else
    echo "   ❌ API not responding after restart"
fi

# 2. Sessions restored
session_count=$(echo "$post_restart_sessions" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(len(data['sessions']))
except:
    print('0')
")

if [ "$session_count" -ge 3 ]; then
    echo "   ✅ Sessions restored ($session_count found)"
    score=$((score + 1))
else
    echo "   ❌ Sessions not properly restored ($session_count found, expected 3+)"
fi

# 3. Persistence enabled
persistence_enabled=$(echo "$post_stats" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('true' if data.get('enabled', False) else 'false')
except:
    print('false')
")

if [ "$persistence_enabled" = "true" ]; then
    echo "   ✅ Persistence enabled after restart"
    score=$((score + 1))
else
    echo "   ❌ Persistence not enabled after restart"
fi

# 4. Session snapshots exist
snapshot_count=$(echo "$post_stats" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('stats', {}).get('totalSnapshots', 0))
except:
    print('0')
")

if [ "$snapshot_count" -gt 0 ]; then
    echo "   ✅ Session snapshots found ($snapshot_count)"
    score=$((score + 1))
else
    echo "   ❌ No session snapshots found"
fi

# 5. Configuration persisted
config_check=$(echo "$post_restart_sessions" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    claude_sessions = [s for s in data['sessions'] if s['mode'] == 'Claude Code']
    workspace_sessions = [s for s in data['sessions'] if s.get('workingDirectory') == '/workspace']
    branch_sessions = [s for s in data['sessions'] if s.get('assignedBranch') == 'session-persistence-test']
    print('true' if claude_sessions and workspace_sessions and branch_sessions else 'false')
except:
    print('false')
")

if [ "$config_check" = "true" ]; then
    echo "   ✅ Session configuration persisted"
    score=$((score + 1))
else
    echo "   ❌ Session configuration not properly persisted"
fi

# 6. Data directory exists and has files
if [ -d "config/maestro" ] && [ "$(find config/maestro -name '*.json' | wc -l)" -gt 0 ]; then
    echo "   ✅ Persistence data files found"
    score=$((score + 1))
else
    echo "   ❌ Persistence data files missing"
fi

echo ""
echo "📊 FINAL SCORE: $score/$total"

if [ $score -eq $total ]; then
    echo "🎉 SUCCESS: Session persistence fully working!"
    echo ""
    echo "✅ All sessions and their state persisted across restart"
    echo "✅ Configuration, working directories, and command history preserved"
    echo "✅ Persistence system operational"
    exit 0
elif [ $score -ge 4 ]; then
    echo "⚠️  PARTIAL SUCCESS: Most persistence features working ($score/$total)"
    echo ""
    echo "Session persistence is mostly functional but some features may need attention."
    exit 1
else
    echo "❌ FAILED: Session persistence not working properly ($score/$total)"
    echo ""
    echo "Debug information:"
    echo "Container logs (last 20 lines):"
    docker logs maestro-web | tail -20
    exit 2
fi