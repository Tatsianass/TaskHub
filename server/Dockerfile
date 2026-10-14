FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN node -e "const [maj,min]=process.versions.node.split('.').map(Number); if (maj<22 || (maj===22 && min<13)) { console.error('node:sqlite needs >=22.13, got '+process.versions.node); process.exit(1); }"
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
