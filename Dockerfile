# Glama (and similar registries) build this image to run MCP introspection.
# The server is stdio: it must start and answer tools/list without an nsec.
# syntax=docker/dockerfile:1

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV BRIDGE_URL=https://gittr.space

COPY package.json package-lock.json ./
# prepare installs git hooks; there is no .git in the image
RUN npm ci --omit=dev --ignore-scripts

COPY . .

CMD ["node", "server.js"]
