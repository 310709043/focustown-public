FROM node:20-alpine AS base
# Pin pnpm to v9 (latest series compatible with Node 20). corepack's default
# resolves to pnpm 11.x which requires Node 22+ and breaks on this base.
RUN npm install -g pnpm@9
WORKDIR /app

# Deps layer: only invalidates when package.json or pnpm-lock.yaml change,
# so editing .tsx files no longer triggers a full reinstall on rebuild.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod=false --frozen-lockfile

# Dev image: reuse the deps layer's node_modules; source is bind-mounted
# at runtime via docker-compose so we don't COPY it into the image.
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./
EXPOSE 3000
CMD ["pnpm", "dev"]

# Builder stage: produces the standalone Next.js bundle (.next/standalone +
# .next/static). NEXT_PUBLIC_* are baked into the JS bundle here, so each
# deploy environment requires its own image build with matching build-args.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_WS_BASE_URL
ARG NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_WS_BASE_URL=${NEXT_PUBLIC_WS_BASE_URL}
ENV NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS=${NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS}
ENV NODE_ENV=production
RUN pnpm build

# Runner: minimal image with only the standalone server output.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
