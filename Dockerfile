# --- Stage 1: Build the application ---
FROM node:22-alpine AS builder

WORKDIR /app

# Provide a dummy DATABASE_URL to satisfy Prisma config parsing during build
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"

# Copy package files, prisma folder, and prisma config file
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install ALL dependencies (triggers postinstall -> prisma generate)
RUN npm ci

# Copy source code and compile
COPY . .
RUN npm run build


# --- Stage 2: Staging/Production runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=staging

# Copy package files
COPY package*.json ./

# Install production dependencies only (skip postinstall script)
RUN npm ci --omit=dev --ignore-scripts

# Copy Prisma schema, config, and generated client engines from builder
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy the compiled application code
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]