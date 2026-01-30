#!/bin/bash

# Quick Credential Persistence Test for Maestro Web
# Tests persistence without rebuilding the container

set -e

echo "🧪 Quick credential persistence test..."
echo ""

cd /tmp/maestro-test

echo "=== STEP 1: Initial State ==="

# Check if container is running
if docker ps -q -f name=maestro-web | grep -q .; then
    echo "✅ Container is currently running"

    # Test API
    if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
        echo "✅ API is responding"
    else
        echo "❌ API not responding"
        exit 1
    fi

    # Check current profiles
    echo "📋 Current profiles:"
    curl -s "http://localhost:3100/api/profiles" | python3 -m json.tool | grep -E '"name"|"mode"' || echo "   No profiles"

    # Create a test profile
    echo "🔧 Creating persistence test profile..."
    curl -s -X POST "http://localhost:3100/api/profiles" \
      -H "Content-Type: application/json" \
      -d '{
        "name": "Persistence Test Profile",
        "mode": "Claude Code",
        "permissionMode": "default",
        "workingDirectory": "/workspace/persistence-test"
      }' > /dev/null
    echo "✅ Test profile created"

else
    echo "❌ Container not running"
    exit 1
fi

echo ""
echo "=== STEP 2: Capturing Initial State ==="

# Capture config state
echo "📸 Capturing initial config state..."
initial_config_size=$(du -sb config/ | cut -f1)
initial_profiles=$(curl -s "http://localhost:3100/api/profiles")
initial_claude_files=$(find config/claude -type f 2>/dev/null | wc -l)
initial_maestro_config_size=$(wc -c < config/maestro/config.json 2>/dev/null || echo "0")

echo "   Initial config size: $initial_config_size bytes"
echo "   Initial Claude files: $initial_claude_files"
echo "   Initial Maestro config: $initial_maestro_config_size bytes"

echo ""
echo "=== STEP 3: Container Restart Test ==="

# Restart the container (not rebuild)
echo "🔄 Restarting container..."
docker restart maestro-web

echo "⏱️  Waiting for restart..."
sleep 10

# Check if container came back up
if ! docker ps -q -f name=maestro-web | grep -q .; then
    echo "❌ Container failed to restart"
    docker logs maestro-web
    exit 1
fi

echo "✅ Container restarted successfully"

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
for i in {1..15}; do
    if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
        echo "✅ API is responding after restart"
        break
    elif [ $i -eq 15 ]; then
        echo "❌ API not responding after restart"
        exit 1
    else
        echo "   Attempt $i/15..."
        sleep 2
    fi
done

echo ""
echo "=== STEP 4: Verifying Persistence ==="

# Check config state after restart
final_config_size=$(du -sb config/ | cut -f1)
final_profiles=$(curl -s "http://localhost:3100/api/profiles")
final_claude_files=$(find config/claude -type f 2>/dev/null | wc -l)
final_maestro_config_size=$(wc -c < config/maestro/config.json 2>/dev/null || echo "0")

echo "📊 Post-restart state:"
echo "   Final config size: $final_config_size bytes"
echo "   Final Claude files: $final_claude_files"
echo "   Final Maestro config: $final_maestro_config_size bytes"

echo ""
echo "🔍 Checking specific persistence items:"

# Check if test profile persisted
test_profile_count=$(echo "$final_profiles" | grep -c "Persistence Test Profile" || echo "0")
if [ "$test_profile_count" -gt 0 ]; then
    echo "   ✅ Test profile persisted"
else
    echo "   ❌ Test profile was lost"
fi

# Check if config sizes are reasonable
if [ "$final_config_size" -ge "$initial_config_size" ]; then
    echo "   ✅ Config directory size maintained or grew"
else
    echo "   ⚠️  Config directory size decreased"
fi

# Check Claude files
if [ "$final_claude_files" -ge "$initial_claude_files" ]; then
    echo "   ✅ Claude config files maintained"
else
    echo "   ⚠️  Some Claude config files missing"
fi

# Check volume mounts
echo "🔍 Verifying volume mounts:"
docker inspect maestro-web --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Type}}){{"\n"}}{{end}}' | grep -E "config|workspace" | while read mount; do
    echo "   📂 $mount"
done

echo ""
echo "=== PERSISTENCE SUMMARY ==="

score=0
total=4

echo "📋 Checklist:"

# API responding
if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
    echo "   ✅ API responding after restart"
    score=$((score + 1))
else
    echo "   ❌ API not responding after restart"
fi

# Test profile persisted
if [ "$test_profile_count" -gt 0 ]; then
    echo "   ✅ Test profile persisted"
    score=$((score + 1))
else
    echo "   ❌ Test profile lost"
fi

# Config size maintained
if [ "$final_config_size" -ge "$initial_config_size" ]; then
    echo "   ✅ Config size maintained"
    score=$((score + 1))
else
    echo "   ❌ Config size decreased"
fi

# Claude files maintained
if [ "$final_claude_files" -ge "$initial_claude_files" ]; then
    echo "   ✅ Claude files maintained"
    score=$((score + 1))
else
    echo "   ❌ Claude files lost"
fi

echo ""
echo "📊 SCORE: $score/$total"

if [ $score -eq $total ]; then
    echo "🎉 SUCCESS: Credential persistence verified!"
    exit 0
elif [ $score -ge 2 ]; then
    echo "⚠️  PARTIAL: Some persistence working"
    exit 1
else
    echo "❌ FAILED: Persistence issues detected"
    exit 2
fi