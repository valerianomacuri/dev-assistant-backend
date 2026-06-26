# syntax=docker/dockerfile:1

# Imagen multi-stage para la API NestJS (dev-assistant-backend).
# Se usa node:22-slim (Debian) en lugar de alpine porque `bcrypt` es un módulo
# nativo que compila de forma fiable con glibc.

# ---- Base: corepack/pnpm habilitados ----
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ---- Dependencias: incluye toolchain para compilar bcrypt ----
FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Build: compila TypeScript y deja node_modules solo de producción ----
FROM deps AS build
COPY . .
RUN pnpm build
# Elimina las devDependencies del node_modules conservando el binario ya
# compilado de bcrypt, para copiar un árbol limpio al runtime.
RUN pnpm prune --prod

# ---- Runtime: imagen final mínima, sin toolchain ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# Usuario sin privilegios provisto por la imagen oficial de node.
USER node
CMD ["node", "dist/main.js"]
