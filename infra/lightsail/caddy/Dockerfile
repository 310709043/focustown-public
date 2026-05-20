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

# Drop root before bind. Caddy 2 ships with `cap_net_bind_service` set on the
# binary in the official image, so a non-privileged user can still listen on
# :80 / :443. Without this, a parsing CVE in caddy = root in the public-facing
# container.
USER nobody

# No CMD override needed — caddy:2-alpine's default entrypoint already runs
# `caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`.
