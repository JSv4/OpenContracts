ARG PYTHON_VERSION=3.12-slim-bookworm
FROM python:${PYTHON_VERSION} as python

# Python build stage
FROM python as python-build-stage

ARG BUILD_ENVIRONMENT=production

# Install apt packages
RUN apt-get update && apt-get install --no-install-recommends -y \
  # dependencies for building Python packages
  apt-utils \
  wget \
  build-essential \
  cmake \
  automake \
  libfreetype6-dev \
  pkg-config \
  libfontconfig-dev \
  libjpeg-dev \
  libopenjp2-7-dev \
  libcairo2-dev \
  libtiff5-dev \
  tesseract-ocr \
  libtesseract-dev \
  git \
  # psycopg2 dependencies
  libpq-dev

# Copy the entire requirements directory for recursive building
COPY ./requirements ./requirements

# Upgrade pip
RUN pip install --upgrade pip

# Recursively build wheels for all *.txt found within requirements directory
RUN find ./requirements -type f -name "*.txt" -exec echo "-r" {} \; | \
    xargs pip wheel --wheel-dir /usr/src/app/wheels

# Python 'run' stage
FROM python as python-run-stage

ARG BUILD_ENVIRONMENT=production
ARG APP_HOME=/app

ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1
ENV BUILD_ENV ${BUILD_ENVIRONMENT}

WORKDIR ${APP_HOME}

RUN addgroup --system django \
    && adduser --system --ingroup django django


# Install required system dependencies
RUN apt-get update && apt-get install --no-install-recommends -y \
  # psycopg2 dependencies
  libpq-dev \
  # Translations dependencies
  gettext \
  git \
  poppler-utils \
  tesseract-ocr \
  libtesseract-dev \
  # cleaning up unused files
  && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
  && rm -rf /var/lib/apt/lists/*

# Copy python dependency wheels from the python-build-stage and install them
COPY --from=python-build-stage /usr/src/app/wheels /wheels/
RUN pip install --upgrade pip

# Install CPU-less requirements
RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install sentence-transformers

# Install the remaining Python dependencies from wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels/ /wheels/* \
    && rm -rf /wheels/

# Create /models, copy model preloaders from the build context, and run them
RUN mkdir -p /models
COPY ./model_preloaders ./model_preloaders
RUN for script in ./model_preloaders/*.py; do \
      echo "Running $script"; \
      python "$script"; \
    done

# Download spacy models
RUN python -m spacy download en_core_web_sm
RUN python -m spacy download en_core_web_lg

COPY --chown=django:django ./compose/production/django/entrypoint /entrypoint
RUN sed -i 's/\r$//g' /entrypoint
RUN chmod +x /entrypoint


COPY --chown=django:django ./compose/production/django/start /start
RUN sed -i 's/\r$//g' /start
RUN chmod +x /start

COPY --chown=django:django ./compose/production/django/celery/worker/start /start-celeryworker
RUN sed -i 's/\r$//g' /start-celeryworker
RUN chmod +x /start-celeryworker


COPY --chown=django:django ./compose/production/django/celery/beat/start /start-celerybeat
RUN sed -i 's/\r$//g' /start-celerybeat
RUN chmod +x /start-celerybeat


COPY ./compose/production/django/celery/flower/start /start-flower
RUN sed -i 's/\r$//g' /start-flower
RUN chmod +x /start-flower

# Copy the full application code
COPY --chown=django:django . ${APP_HOME}

# make django owner of the WORKDIR directory as well.
RUN chown django:django ${APP_HOME}

USER django

ENTRYPOINT ["/entrypoint"]
