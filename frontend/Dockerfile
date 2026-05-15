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
