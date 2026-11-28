FROM postgis/postgis:18-3.7@sha256:57e61cca60b05756e56da5979c23f8360c13d3eb18d1cfbd9e44c467c5926c87

# Extensions used by the checked-in migration ledger. Install them in the image;
# the init script creates the extensions as the database administrator before
# the application migration role is allowed to run.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    postgresql-18-pgvector=0.8.7-2.pgdg13+1 \
    postgresql-contrib-18 \
  && rm -rf /var/lib/apt/lists/*
