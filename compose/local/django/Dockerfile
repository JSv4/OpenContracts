ARG PYTHON_VERSION=3.10-buster

# define an alias for the specfic python version used in this file.
FROM python:${PYTHON_VERSION} as python

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

# RUN wget https://poppler.freedesktop.org/poppler-data-0.4.10.tar.gz \
#     && tar -xf poppler-data-0.4.10.tar.gz \
#     && cd poppler-data-0.4.10 \
#     && make install \
#     && cd .. \
#     && wget https://poppler.freedesktop.org/poppler-21.03.0.tar.xz \
#     && tar -xf poppler-21.03.0.tar.xz \
#     && cd poppler-21.03.0 \
#     && mkdir build \
#     && cd build \
#     && cmake .. \
#     && make \
#     && make install \
#     && cd ../.. \
#     && ldconfig \
#     && rm poppler-data-0.4.10.tar.gz \
#     && rm -rf poppler-data-0.4.10 \
#     && rm poppler-21.03.0.tar.xz \
#     && rm -rf poppler-21.03.0
# CMD tail -f /dev/null

# Get tesseract tessdata file
# RUN wget https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata -P /usr/share/tessdata

# Requirements are installed here to ensure they will be cached.
COPY ./requirements .

# Create Python Dependency and Sub-Dependency Wheels.
RUN pip wheel --wheel-dir /usr/src/app/wheels  \
  -r ${BUILD_ENVIRONMENT}.txt

# Python 'run' stage
FROM python as python-run-stage

ARG BUILD_ENVIRONMENT=local
ARG APP_HOME=/app
ARG GITHUB_ACTIONS

ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1
ENV BUILD_ENV ${BUILD_ENVIRONMENT}

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
  # cleaning up unused files
  && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
  && rm -rf /var/lib/apt/lists/*

# All absolute dir copies ignore workdir instruction. All relative dir copies are wrt to the workdir instruction
# copy python dependency wheels from python-build-stage
COPY --from=python-build-stage /usr/src/app/wheels  /wheels/

# Install CPU-less requirements
RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install sentence-transformers

# use wheels to install python dependencies
RUN pip install --no-cache-dir --no-index --find-links=/wheels/ /wheels/* \
	&& rm -rf /wheels/

# If this is in GitHub action (env var CI = true), install codecov
RUN echo "RUN STAGE GITHUB_ACTIONS: $GITHUB_ACTIONS"
COPY ./setup_codecov.sh .
RUN if [ "$GITHUB_ACTIONS" ] ; then echo "GITHUB ACTION MODE" && chmod u+x setup_codecov.sh && ./setup_codecov.sh ; else echo "NOT GITHUB ACTION. DO NOT INSTALL CODECOV" ; fi

# Download sentence transformer binaries
COPY download_embeddings_model.py .
RUN mkdir -p /models
RUN python download_embeddings_model.py

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


# copy application code to WORKDIR
COPY . ${APP_HOME}

ENTRYPOINT ["/entrypoint"]
