# Build context: repository root (uses the root workspace lockfile).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace client --ignore-scripts
COPY client ./client
RUN npm run build --workspace client

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY client/nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
