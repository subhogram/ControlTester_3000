# Multi-stage build for Agent-Assess application
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the application
# This creates:
# - dist/public/ (Vite client build with index.html and assets)
# - dist/index.js (esbuild server bundle)
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package.json for npm start command
COPY --from=builder /app/package.json ./

# Copy built application (includes both server bundle and client static files)
COPY --from=builder /app/dist ./dist

# Copy shared types/schemas (may be referenced by server bundle)
COPY --from=builder /app/shared ./shared

# Copy production dependencies only
COPY --from=deps /app/node_modules ./node_modules

# Create directories for vectorstore data
RUN mkdir -p /app/global_kb_vectorstore /app/company_kb_vectorstore /app/chat_attachment_vectorstore /app/chat_attachments

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser && \
    chown -R appuser:nodejs /app

USER appuser

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "run", "start"]
