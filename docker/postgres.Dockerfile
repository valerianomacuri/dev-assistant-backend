FROM postgres:16

# La imagen oficial de Postgres no incluye pgvector; lo instalamos desde apt.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-pgvector \
 && rm -rf /var/lib/apt/lists/*
