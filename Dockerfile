FROM node:20-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PORT=8080 \
    API_ONLY=true

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/server/data/drawing-ocr-pack ./server-pack-data/drawing-ocr-pack
COPY --from=build /app/server/assets/fonts ./server-assets/fonts

EXPOSE 8080

CMD ["node", "dist/index.js"]
