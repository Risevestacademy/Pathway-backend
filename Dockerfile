# --- Stage 1: Build the application ---
FROM node:22-alpine AS builder

WORKDIR /app

ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build


# --- Stage 2: Staging/Production runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=staging

COPY package*.json ./

# Installs @prisma/client (runtime helpers) as a normal prod dependency
RUN npm ci --omit=dev --ignore-scripts

# Only needed if you run `prisma migrate deploy` at runtime/entrypoint
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# dist/generated is compiled TS — the whole client ships here now
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]