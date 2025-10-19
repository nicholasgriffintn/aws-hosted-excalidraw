FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS build
WORKDIR /app

ARG VITE_EXCALIDRAW_ASSET_BUCKET
ARG VITE_EXCALIDRAW_TEAM_ID
ARG VITE_AWS_REGION
ARG EXCALIDRAW_API_URL
ARG EXCALIDRAW_WS_URL

ENV VITE_EXCALIDRAW_ASSET_BUCKET=${VITE_EXCALIDRAW_ASSET_BUCKET}
ENV VITE_EXCALIDRAW_TEAM_ID=${VITE_EXCALIDRAW_TEAM_ID}
ENV VITE_AWS_REGION=${VITE_AWS_REGION}
ENV EXCALIDRAW_API_URL=${EXCALIDRAW_API_URL}
ENV EXCALIDRAW_WS_URL=${EXCALIDRAW_WS_URL}

COPY package.json pnpm-workspace.yaml .
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/frontend-server/package.json ./apps/frontend-server/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install

COPY apps/frontend ./apps/frontend
COPY apps/frontend-server ./apps/frontend-server

RUN pnpm --filter "@aws-hosted-excalidraw/frontend" build
RUN pnpm --filter "@aws-hosted-excalidraw/frontend-server" build

FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json pnpm-workspace.yaml .
COPY apps/frontend-server/package.json ./apps/frontend-server/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --prod --filter "@aws-hosted-excalidraw/frontend-server"...

COPY --from=build /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=build /app/apps/frontend-server/dist ./apps/frontend-server/dist

RUN chown -R node:node /app
USER node
ENV HOME=/home/node

EXPOSE 3000

CMD ["node", "apps/frontend-server/dist/index.js"]
