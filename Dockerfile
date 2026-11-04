# syntax=docker/dockerfile:1
# One API of this project with its web frontend on vantage-server:
#   docker build --platform linux/amd64 --build-arg API=admin -t admin .
ARG WEB_DEV=romaninsh/vantage-web-dev:1.12.2
ARG SERVER=romaninsh/vantage-server:1.12.2

# The built site is plain files, so this stage runs natively even when the image is for another platform.
FROM --platform=$BUILDPLATFORM ${WEB_DEV} AS web
ARG API
RUN test -n "$API" || { echo "pass --build-arg API=<name> (api/<name>.yaml)" >&2; exit 1; }
COPY --chown=node:node web/${API} /app
RUN node /opt/vantage/entrypoint/main.mjs build --out /app/out

FROM ${SERVER}
ARG API
COPY application.yaml /app/project/application.yaml
COPY datasource /app/project/datasource
COPY table /app/project/table
COPY api /app/project/api
COPY action /app/project/action
# The web admin calls the desktop pages' row actions (Confirm order, Ship order, …): they live in page/.
COPY page /app/project/page
# Add `COPY policy /app/project/policy` once policy/ holds a policy of our own.
COPY --from=web /app/out /app/web
ENV VANTAGE_API=${API}
CMD ["--static", "/app/web"]
