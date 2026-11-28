FROM postgis/postgis:18-3.7

USER root
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql-18-pgvector \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=postgres:postgres entrypoint.sh /usr/local/bin/opscore-postgres-entrypoint.sh
RUN chmod 0755 /usr/local/bin/opscore-postgres-entrypoint.sh

USER postgres
ENTRYPOINT ["/usr/local/bin/opscore-postgres-entrypoint.sh"]
