FROM node:24-alpine

# Installed directly rather than via corepack: corepack's bundled signing keys
# can be older than the pnpm version in package.json's packageManager field,
# which makes `corepack enable` fail the integrity check.
RUN npm install -g pnpm@10.18.2

ENV NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

WORKDIR /app
RUN chown node:node /app
USER node

# Dependencies first, so source edits don't invalidate the install layer.
COPY --chown=node:node package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY --chown=node:node . .

# NODE_ENV is deliberately left unset: `next build` and `next start` default it
# to production themselves, whereas setting it above would prune
# devDependencies and next.config.js needs source-map-loader at build time.
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0"]
