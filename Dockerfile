# RewardRail API. Build from the repo root:  docker build -t rewardrail-api .
# Works on any container host (Render, Railway, Fly). The web app is static and deployed separately.

FROM node:22-slim AS build
# Prisma's engines need OpenSSL, which the slim image doesn't ship.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Dependencies first, so this layer is cached until package files change.
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
# api/postinstall runs `prisma generate`, which needs the schema to exist already.
COPY api/prisma api/prisma
RUN npm ci --workspace api

COPY api ./api
RUN npm run build --workspace api


FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api ./api
WORKDIR /app/api

# Not root: if the app is ever compromised it cannot, say, rewrite the image's files.
USER node
EXPOSE 3000

# On every start: apply pending migrations (safe to repeat), optionally seed the demo data
# (the seed is idempotent), then run the API. The prisma CLI and ts-node are kept in the
# image on purpose so this works without a separate release step.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_ON_START\" = \"true\" ]; then npx prisma db seed; fi && node dist/main"]
