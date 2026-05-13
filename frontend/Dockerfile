FROM node:20-alpine AS base
# pin pnpm to v9 (latest series compatible with Node 20). corepack's default
# resolves to pnpm 11.x which requires Node 22+ and breaks on this base.
RUN npm install -g pnpm@9
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN pnpm install --prod=false

FROM base AS dev
COPY package.json ./
RUN pnpm install --prod=false
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]
