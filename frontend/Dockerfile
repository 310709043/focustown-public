FROM node:20-alpine AS base
RUN corepack enable pnpm
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
