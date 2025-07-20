ARG PYTORCH_VERSION=2.7.1-cuda12.6-cudnn9-runtime
FROM pytorch/pytorch:${PYTORCH_VERSION} as python

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

# CUDA-specific environment variables for optimal performance
ENV CUDA_MODULE_LOADING=LAZY
ENV TORCH_CUDA_ARCH_LIST="6.0;6.1;7.0;7.5;8.0;8.6;8.9;9.0"
ENV CUDA_VISIBLE_DEVICES=0
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

WORKDIR ${APP_HOME}

RUN groupadd --system django \
    && useradd --system --gid django --no-log-init --create-home --home-dir /home/django django


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
  tesseract-ocr-eng \
  ffmpeg \
  libsm6 \
  libxext6 \
  libgl1 \
  # cleaning up unused files
  && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
  && rm -rf /var/lib/apt/lists/*

# Copy python dependency wheels from the python-build-stage and install them
COPY --from=python-build-stage /usr/src/app/wheels /wheels/
RUN pip install --upgrade pip

# PyTorch is already installed in the base image with CUDA support
# Just install sentence-transformers which will use the existing PyTorch
RUN pip install sentence-transformers

# Install the remaining Python dependencies from wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels/ /wheels/* \
    && rm -rf /wheels/

# Create /models, copy model preloaders from the build context, and run them
RUN mkdir -p /models
RUN chown django:django /models
COPY ./model_preloaders ./model_preloaders
RUN for script in ./model_preloaders/*.py; do \
      echo "Running $script"; \
      python "$script"; \
    done

# Download spacy models
RUN python -m spacy download en_core_web_sm
RUN python -m spacy download en_core_web_lg

# Change ownership of the entire /models directory AFTER models are downloaded
RUN chown -R django:django /models

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
