# Tiltfile for OpenContracts local Kubernetes development
# Manages Kind cluster with ctlptl and provides core services

# Configuration
CLUSTER_NAME = 'kind-opencontracts-local'
REGISTRY_NAME = 'opencontracts-registry'
REGISTRY_PORT = '5005'

# Note: Cluster and registry should be created using tilt-setup.py before running Tilt
# This ensures cross-platform compatibility (Windows, macOS, Linux)

# Load secret extension
load('ext://secret', 'secret_create_generic')

# Create secrets from .env files
secret_create_generic(
    'django-secrets',
    from_env_file='.envs/.local/.django'
)

secret_create_generic(
    'postgres-secrets',
    from_env_file='.envs/.local/.postgres'
)

# Generate K8s configs from .env files (non-sensitive only)
k8s_yaml(local('python3 tilt-helpers.py django-config', quiet=True))
k8s_yaml(local('python3 tilt-helpers.py postgres-config', quiet=True))
k8s_yaml(local('python3 tilt-helpers.py frontend-config', quiet=True))

# Load static storage configuration
k8s_yaml(['./k8s/base/postgres-data-pvc.yaml', './k8s/base/postgres-backups-pvc.yaml'])

# PostgreSQL deployment
docker_build(
    'localhost:{}/opencontracts-postgres'.format(REGISTRY_PORT),
    context='.',
    dockerfile='./compose/production/postgres/Dockerfile'
)

k8s_yaml('./k8s/base/postgres-deployment.yaml')
k8s_yaml('./k8s/base/postgres-service.yaml')

k8s_resource('postgres', port_forwards='5433:5432')

# Redis deployment
k8s_yaml('./k8s/base/redis-deployment.yaml')
k8s_yaml('./k8s/base/redis-service.yaml')

k8s_resource('redis')

# Django deployment
docker_build(
    'localhost:{}/opencontracts-django'.format(REGISTRY_PORT),
    context='.',
    dockerfile='./compose/local/django/Dockerfile'
)

k8s_yaml('./k8s/base/django-deployment.yaml')
k8s_yaml('./k8s/base/django-service.yaml')

k8s_resource('django',
    port_forwards='8000:8000',
    resource_deps=['postgres', 'redis']
)

# Celery workers
k8s_yaml('./k8s/base/celeryworker-deployment.yaml')
k8s_yaml('./k8s/base/celerybeat-deployment.yaml')

k8s_resource('celeryworker',
    resource_deps=['postgres', 'redis', 'django']
)

k8s_resource('celerybeat',
    resource_deps=['postgres', 'redis', 'django']
)

# External microservices (use existing images)
k8s_yaml('./k8s/base/docling-parser-deployment.yaml')
k8s_yaml('./k8s/base/docling-parser-service.yaml')
k8s_yaml('./k8s/base/vector-embedder-deployment.yaml')
k8s_yaml('./k8s/base/vector-embedder-service.yaml')

k8s_resource('docling-parser')
k8s_resource('vector-embedder')

print("✅ Core infrastructure services configured")
print("🔧 To add development services, run: tilt up -f Tiltfile.dev")
print("🌐 Local registry available at localhost:{}".format(REGISTRY_PORT))
