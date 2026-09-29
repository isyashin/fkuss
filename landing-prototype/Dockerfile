FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
WORKDIR /app/landing-prototype
COPY --chown=node:node server.mjs auth.mjs render.mjs app.js admin.js index.html admin.html login.html styles.css admin.css ./
COPY --chown=node:node content ./content
COPY --chown=node:node assets ./assets
USER node
EXPOSE 4185
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "--input-type=module", "-e", "const r = await fetch('http://127.0.0.1:4185/healthz'); process.exit(r.ok ? 0 : 1)"]
CMD ["node", "server.mjs"]
