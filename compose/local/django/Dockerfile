ARG PYTORCH_VERSION=2.7.1-cuda12.6-cudnn9-runtime

# define an alias for the specific pytorch version used in this file.
FROM pytorch/pytorch:${PYTORCH_VERSION} as python

# Python build stage
FROM python as python-build-stage

ARG BUILD_ENVIRONMENT=local
ARG GITHUB_ACTIONS

# Debugging line for build args
RUN echo "GITHUB_ACTIONS: $GITHUB_ACTIONS"

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

# Copy the entire requirements directory
COPY ./requirements ./requirements

RUN pip install --upgrade pip

# Build wheels for all requirements files found in the requirements directory and subdirectories
RUN find ./requirements -type f -name "*.txt" -exec echo "-r" {} \; | \
  xargs pip wheel --wheel-dir /usr/src/app/wheels

# Python 'run' stage
FROM python as python-run-stage

ARG BUILD_ENVIRONMENT=local
ARG APP_HOME=/app
ARG GITHUB_ACTIONS

ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1
ENV BUILD_ENV ${BUILD_ENVIRONMENT}

# CUDA-specific environment variables for optimal performance
ENV CUDA_MODULE_LOADING=LAZY
ENV TORCH_CUDA_ARCH_LIST="6.0;6.1;7.0;7.5;8.0;8.6;8.9;9.0"
ENV CUDA_VISIBLE_DEVICES=0
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

WORKDIR ${APP_HOME}

# Install required system dependencies
RUN apt-get update && apt-get install --no-install-recommends -y \
  # psycopg2 dependencies
  libpq-dev \
  # Translations dependencies
  gettext \
  git \
  poppler-utils \
  tesseract-ocr \
  libtesseract-dev  \
  ffmpeg \
  libsm6 \
  libxext6 \
  tesseract-ocr-eng \
  # cleaning up unused files
  && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
  && rm -rf /var/lib/apt/lists/*

# All absolute dir copies ignore workdir instruction. All relative dir copies are wrt to the workdir instruction
# copy python dependency wheels from python-build-stage
COPY --from=python-build-stage /usr/src/app/wheels  /wheels/

RUN pip install --upgrade pip

# PyTorch is already installed in the base image, so we skip torch installation
# Just install sentence-transformers which will use the existing PyTorch
RUN pip install sentence-transformers

# use wheels to install python dependencies
RUN pip install --no-cache-dir --no-index --find-links=/wheels/ /wheels/* \
	&& rm -rf /wheels/

# Create the /models directory and set permissions
RUN mkdir -p /models && chmod -R 755 /models

# Copy the model_preloaders directory
COPY ./model_preloaders ./model_preloaders

# Run all Python scripts in the model_preloaders directory to download models to /models
RUN for script in ./model_preloaders/*.py; do \
      echo "Running $script"; \
      python "$script"; \
    done

# Download spacy models
RUN python -m spacy download en_core_web_sm
RUN python -m spacy download en_core_web_lg

COPY ./compose/production/django/entrypoint /entrypoint
RUN sed -i 's/\r$//g' /entrypoint
RUN chmod +x /entrypoint

COPY ./compose/local/django/start /start
RUN sed -i 's/\r$//g' /start
RUN chmod +x /start

COPY ./compose/local/django/celery/worker/start /start-celeryworker
RUN sed -i 's/\r$//g' /start-celeryworker
RUN chmod +x /start-celeryworker

COPY ./compose/local/django/celery/beat/start /start-celerybeat
RUN sed -i 's/\r$//g' /start-celerybeat
RUN chmod +x /start-celerybeat

COPY ./compose/local/django/celery/flower/start /start-flower
RUN sed -i 's/\r$//g' /start-flower
RUN chmod +x /start-flower

# Update the environment variable check, after all stages
COPY ./setup_codecov.sh .
RUN echo "RUN STAGE GITHUB_ACTIONS: $GITHUB_ACTIONS" && \
    sed -i 's/\r$//' ./setup_codecov.sh && \
    if [ "$GITHUB_ACTIONS" = "true" ] ; then \
        echo "GITHUB ACTION MODE" && \
        apt-get update && \
        apt-get install -y curl && \
        chmod u+x setup_codecov.sh && \
        bash ./setup_codecov.sh && \
        ls -la /bin/codecov && \
        apt-get remove -y curl && \
        apt-get autoremove -y && \
        rm -rf /var/lib/apt/lists/* ; \
    else \
        echo "NOT GITHUB ACTION. DO NOT INSTALL CODECOV" ; \
    fi

# copy application code to WORKDIR
COPY . ${APP_HOME}

# Clean up pip cache
RUN pip cache purge

ENTRYPOINT ["/entrypoint"]
