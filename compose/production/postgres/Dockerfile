FROM pgvector/pgvector:pg15

RUN apt-get update && apt-get install -y git build-essential postgresql-server-dev-15
RUN cd /tmp && git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git && cd pgvector && make && make install # may need sudo

COPY ./compose/production/postgres/maintenance /usr/local/bin/maintenance
RUN chmod +x /usr/local/bin/maintenance/*
RUN mv /usr/local/bin/maintenance/* /usr/local/bin \
    && rmdir /usr/local/bin/maintenance
