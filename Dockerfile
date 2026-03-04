# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Install all dependencies (including devDependencies needed for TypeScript compilation)
COPY package*.json tsconfig.json ./
RUN npm ci

# Compile TypeScript
COPY src/ ./src/
RUN npm run build

# ---- Production stage ----
FROM node:18-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from build stage
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server.js"]
