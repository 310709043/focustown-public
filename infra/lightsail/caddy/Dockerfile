# Custom Caddy image — bakes the repo-root Caddyfile into /etc/caddy/Caddyfile.
#
# Why: Lightsail Container Service does NOT support volume mounts, and the
# upstream `caddy:2-alpine` image ships with a default Caddyfile that serves
# a placeholder welcome page on :80 — not our reverse-proxy routes. To get
# the project's routing (per-path → localhost:{backend,frontend}) into the
# deployed caddy container, we have to package it as our own image.
#
# Build context = repo root, so the COPY can reach ../../../Caddyfile.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
# No CMD override needed — caddy:2-alpine's default entrypoint already runs
# `caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`.
