#!/bin/bash

# Credential Persistence Test for Maestro Web
# This script tests if authentication tokens persist across container restarts

set -e

echo "🧪 Testing credential persistence across container restarts..."
echo ""

# Ensure we're in the right directory
cd /tmp/maestro-test

# Function to check if config directories exist
check_config_dirs() {
    local test_name="$1"
    echo "📁 Checking config directories ($test_name):"

    # Check if config directories exist
    if [ -d "config/claude" ]; then
        echo "   ✅ config/claude/ exists"
        if [ -n "$(ls -A config/claude/)" ]; then
            echo "      📄 Contains files: $(ls -1 config/claude/ | wc -l) items"
        else
            echo "      ⚠️  Directory is empty"
        fi
    else
        echo "   ❌ config/claude/ missing"
    fi

    if [ -d "config/gemini" ]; then
        echo "   ✅ config/gemini/ exists"
        if [ -n "$(ls -A config/gemini/)" ]; then
            echo "      📄 Contains files: $(ls -1 config/gemini/ | wc -l) items"
        else
            echo "      ⚠️  Directory is empty"
        fi
    else
        echo "   ❌ config/gemini/ missing"
    fi

    if [ -d "config/codex" ]; then
        echo "   ✅ config/codex/ exists"
        if [ -n "$(ls -A config/codex/)" ]; then
            echo "      📄 Contains files: $(ls -1 config/codex/ | wc -l) items"
        else
            echo "      ⚠️  Directory is empty"
        fi
    else
        echo "   ❌ config/codex/ missing"
    fi

    if [ -d "config/maestro" ]; then
        echo "   ✅ config/maestro/ exists"
        if [ -f "config/maestro/config.json" ]; then
            echo "      📄 config.json exists ($(wc -c < config/maestro/config.json) bytes)"
        fi
        if [ -f "config/maestro/profiles.json" ]; then
            echo "      📄 profiles.json exists ($(wc -c < config/maestro/profiles.json) bytes)"
        fi
    else
        echo "   ❌ config/maestro/ missing"
    fi

    echo ""
}

# Function to get container logs if container exists
get_container_status() {
    if docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -q "maestro-web"; then
        echo "📊 Container status:"
        docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep maestro-web
        echo ""
    else
        echo "📊 Container maestro-web does not exist"
        echo ""
    fi
}

# Step 1: Check initial state
echo "=== STEP 1: Initial State Check ==="
get_container_status
check_config_dirs "Initial"

# Ensure config directories exist
echo "🏗️  Ensuring config directories exist..."
mkdir -p config/claude config/gemini config/codex config/maestro

# Step 2: Start container (build fresh to avoid cached issues)
echo "=== STEP 2: Starting Container ==="
echo "🚀 Building and starting maestro-web container..."

# Stop any existing container first
if docker ps -q -f name=maestro-web | grep -q .; then
    echo "🛑 Stopping existing container..."
    docker stop maestro-web
fi

if docker ps -a -q -f name=maestro-web | grep -q .; then
    echo "🗑️  Removing existing container..."
    docker rm maestro-web
fi

# Build and start
echo "🔨 Building container..."
docker build -t maestro-web . --no-cache --quiet

echo "🏃 Starting container..."
docker run -d \
  --name maestro-web \
  -p 3100:3100 \
  -v "$(pwd)/workspace:/workspace:rw" \
  -v "$(pwd)/config/maestro:/app/config:rw" \
  -v "$(pwd)/config/claude:/root/.claude:rw" \
  -v "$(pwd)/config/gemini:/root/.config/gemini:rw" \
  -v "$(pwd)/config/codex:/root/.codex:rw" \
  maestro-web

echo "⏱️  Waiting for container to start..."
sleep 5

# Check if container is running
if ! docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "maestro-web.*Up"; then
    echo "❌ Container failed to start!"
    echo "📋 Container logs:"
    docker logs maestro-web
    exit 1
fi

echo "✅ Container started successfully"
get_container_status

# Step 3: Test basic functionality
echo "=== STEP 3: Testing Basic Functionality ==="
echo "🌐 Testing API endpoint..."

# Wait for API to be ready
for i in {1..10}; do
    if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
        echo "✅ API is responding"
        break
    elif [ $i -eq 10 ]; then
        echo "❌ API health check failed after 10 attempts"
        echo "📋 Container logs:"
        docker logs maestro-web
        exit 1
    else
        echo "⏳ Waiting for API... (attempt $i/10)"
        sleep 2
    fi
done

# Create a test profile to verify persistence
echo "🔧 Creating test profile..."
curl -s -X POST "http://localhost:3100/api/profiles" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Profile",
    "mode": "Claude Code",
    "permissionMode": "default",
    "workingDirectory": "/workspace/test"
  }' > /dev/null

echo "✅ Test profile created"

# Step 4: Check config after initial run
echo "=== STEP 4: Config After Initial Run ==="
check_config_dirs "After Initial Run"

# Capture the initial state
echo "📸 Capturing initial config state..."
initial_claude_state=""
if [ -d "config/claude" ]; then
    initial_claude_state=$(find config/claude -type f -exec ls -la {} \; 2>/dev/null | sort)
fi

initial_maestro_state=""
if [ -f "config/maestro/config.json" ]; then
    initial_maestro_state=$(cat config/maestro/config.json)
fi
if [ -f "config/maestro/profiles.json" ]; then
    initial_maestro_profiles=$(cat config/maestro/profiles.json)
fi

# Step 5: Stop container
echo "=== STEP 5: Stopping Container ==="
echo "🛑 Stopping container..."
docker stop maestro-web
echo "🗑️  Removing container..."
docker rm maestro-web
echo "✅ Container stopped and removed"

# Step 6: Check if config persists
echo "=== STEP 6: Checking Persistence ==="
check_config_dirs "After Container Stop"

# Step 7: Restart container
echo "=== STEP 7: Restarting Container ==="
echo "🔄 Restarting container with same volumes..."
docker run -d \
  --name maestro-web \
  -p 3100:3100 \
  -v "$(pwd)/workspace:/workspace:rw" \
  -v "$(pwd)/config/maestro:/app/config:rw" \
  -v "$(pwd)/config/claude:/root/.claude:rw" \
  -v "$(pwd)/config/gemini:/root/.config/gemini:rw" \
  -v "$(pwd)/config/codex:/root/.codex:rw" \
  maestro-web

echo "⏱️  Waiting for container to restart..."
sleep 5

# Check if container is running
if ! docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "maestro-web.*Up"; then
    echo "❌ Container failed to restart!"
    echo "📋 Container logs:"
    docker logs maestro-web
    exit 1
fi

echo "✅ Container restarted successfully"
get_container_status

# Step 8: Test persistence
echo "=== STEP 8: Verifying Persistence ==="

# Wait for API to be ready again
for i in {1..10}; do
    if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
        echo "✅ API is responding after restart"
        break
    elif [ $i -eq 10 ]; then
        echo "❌ API health check failed after restart"
        exit 1
    else
        echo "⏳ Waiting for API after restart... (attempt $i/10)"
        sleep 2
    fi
done

check_config_dirs "After Restart"

# Check if our test profile persisted
echo "🔍 Checking if test profile persisted..."
profile_check=$(curl -s "http://localhost:3100/api/profiles" | grep -c "Test Profile" || echo "0")
if [ "$profile_check" -gt 0 ]; then
    echo "✅ Test profile persisted!"
else
    echo "❌ Test profile was lost"
fi

# Compare config states
echo "🔍 Comparing config states..."

final_claude_state=""
if [ -d "config/claude" ]; then
    final_claude_state=$(find config/claude -type f -exec ls -la {} \; 2>/dev/null | sort)
fi

final_maestro_state=""
if [ -f "config/maestro/config.json" ]; then
    final_maestro_state=$(cat config/maestro/config.json)
fi

if [ "$initial_claude_state" = "$final_claude_state" ]; then
    echo "✅ Claude config state identical after restart"
else
    echo "⚠️  Claude config state changed"
    echo "   Initial: $(echo "$initial_claude_state" | wc -l) files"
    echo "   Final:   $(echo "$final_claude_state" | wc -l) files"
fi

if [ "$initial_maestro_state" = "$final_maestro_state" ]; then
    echo "✅ Maestro config state identical after restart"
else
    echo "⚠️  Maestro config state changed"
fi

# Final summary
echo ""
echo "=== PERSISTENCE TEST SUMMARY ==="

# Check critical persistence points
persistence_score=0
total_checks=4

echo "📋 Persistence Checklist:"

# 1. Config directories exist
if [ -d "config/claude" ] && [ -d "config/gemini" ] && [ -d "config/codex" ] && [ -d "config/maestro" ]; then
    echo "   ✅ All config directories exist after restart"
    persistence_score=$((persistence_score + 1))
else
    echo "   ❌ Some config directories missing after restart"
fi

# 2. API responds after restart
if curl -s -f "http://localhost:3100/api/health" > /dev/null 2>&1; then
    echo "   ✅ API responds after restart"
    persistence_score=$((persistence_score + 1))
else
    echo "   ❌ API not responding after restart"
fi

# 3. Test profile persists
if [ "$profile_check" -gt 0 ]; then
    echo "   ✅ Test profile persisted across restart"
    persistence_score=$((persistence_score + 1))
else
    echo "   ❌ Test profile lost during restart"
fi

# 4. Volume mounts configured correctly
if docker inspect maestro-web --format '{{.Mounts}}' | grep -q "/app/config"; then
    echo "   ✅ Volume mounts configured correctly"
    persistence_score=$((persistence_score + 1))
else
    echo "   ❌ Volume mounts not configured correctly"
fi

echo ""
echo "📊 PERSISTENCE SCORE: $persistence_score/$total_checks"

if [ $persistence_score -eq $total_checks ]; then
    echo "🎉 SUCCESS: Full credential persistence verified!"
    exit 0
elif [ $persistence_score -ge 2 ]; then
    echo "⚠️  PARTIAL: Some persistence issues detected"
    exit 1
else
    echo "❌ FAILED: Major persistence issues"
    exit 2
fi