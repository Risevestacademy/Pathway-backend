# --- Stage 1: Build the application ---
FROM node:22-alpine AS builder

WORKDIR /app

# 1. Provide a dummy DATABASE_URL to satisfy Prisma 7 config parsing during build.
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"

# 2. Copy package files, prisma folder, AND the prisma config file
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# 3. Install ALL dependencies (this triggers postinstall -> prisma generate, which will now succeed)
RUN npm ci

# 4. Copy source code and build
COPY . .
RUN npm run build

# --- Stage 2: Staging/Production runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=staging

# 1. Copy package files
COPY package*.json ./

# 2. Install ONLY production dependencies. 
# We use --ignore-scripts to prevent the "postinstall" hook from running in this stage,
# since the prisma CLI is a devDependency and not needed here.
RUN npm ci --omit=dev --ignore-scripts

# 3. Copy the pre-generated Prisma Client artifacts from the builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# 4. Copy the compiled JS code from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Start the server (ensure this matches your actual entry point, e.g., dist/main.js)
CMD ["node", "dist/main.js"]