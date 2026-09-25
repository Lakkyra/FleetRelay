FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configs
COPY package.json package-lock.json* pnpm-lock.yaml* ./
COPY packages/contracts ./packages/contracts
COPY services/backend ./services/backend

# Install dependencies and build contracts + backend
WORKDIR /app/packages/contracts
RUN npm install && npm run build

WORKDIR /app/services/backend
RUN npm install && npm run build

# Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder /app/services/backend/dist ./services/backend/dist
COPY --from=builder /app/services/backend/package.json ./services/backend/package.json
COPY --from=builder /app/services/backend/src/db/schema.sql ./services/backend/src/db/schema.sql

WORKDIR /app/services/backend
RUN npm install --omit=dev

EXPOSE 4000

CMD ["node", "dist/index.js"]
