# The shared dev image plus the system libraries Chromium needs, for the UI's
# Playwright tests. Keep the version in step with ui/package.json.
FROM mcr.microsoft.com/devcontainers/javascript-node:22
RUN npx -y playwright@1.63.0 install-deps chromium
