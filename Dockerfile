# Maestro Web - Docker build
# Multi-stage build for optimized production image

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/web

# Install dependencies
COPY web/package.json ./
RUN npm install

# Copy source and build
COPY web/ ./
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-builder

WORKDIR /app/server

# Install dependencies (need node-gyp tools for node-pty)
RUN apk add --no-cache python3 make g++

COPY server/package.json ./
RUN npm install

# Copy source and build
COPY server/ ./
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS production

# Install essential tools for AI CLIs
RUN apk add --no-cache \
    bash \
    git \
    curl \
    python3 \
    make \
    g++ \
    openssh-client

WORKDIR /app

# Install production dependencies for server (need node-gyp tools for node-pty)
RUN apk add --no-cache python3 make g++
COPY server/package.json ./
RUN npm install --only=production

# Copy built server
COPY --from=server-builder /app/server/dist ./dist

# Copy built frontend
COPY --from=frontend-builder /app/web/dist ./web/dist

# Install AI CLI tools
RUN npm install -g @anthropic-ai/claude-code @google/gemini-cli @openai/codex

# Create config directories for CLI authentication persistence
# These can be mounted as volumes to persist credentials across container restarts
RUN mkdir -p /root/.claude /root/.config/gemini /root/.codex

# Environment variables
ENV NODE_ENV=production
ENV PORT=3100
ENV DEFAULT_SESSIONS=0

# API keys can be passed as environment variables:
# - ANTHROPIC_API_KEY for Claude Code
# - GEMINI_API_KEY for Gemini CLI
# - OPENAI_API_KEY for OpenAI Codex

# Create workspace directory for projects
RUN mkdir -p /workspace

# Expose port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3100/api/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
