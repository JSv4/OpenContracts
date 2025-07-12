# Tiltfile for OpenContracts local Kubernetes development
# Manages Kind cluster with ctlptl and provides core services

# Configuration
CLUSTER_NAME = 'kind-opencontracts-local'
REGISTRY_NAME = 'opencontracts-registry'
REGISTRY_PORT = '5005'

# Note: Cluster and registry should be created using tilt-setup.py before running Tilt
# This ensures cross-platform compatibility (Windows, macOS, Linux)

# Load base Kubernetes configurations
k8s_yaml('./k8s/base/django-config.yaml')
k8s_yaml('./k8s/base/postgres-config.yaml')
k8s_yaml('./k8s/base/frontend-config.yaml')
k8s_yaml('./k8s/base/django-secrets.yaml')
k8s_yaml('./k8s/base/postgres-secrets.yaml')
k8s_yaml('./k8s/base/postgres-storage.yaml')

# PostgreSQL deployment
docker_build(
    'localhost:{}/opencontracts-postgres'.format(REGISTRY_PORT),
    context='.',
    dockerfile='./compose/production/postgres/Dockerfile'
)

k8s_yaml('./k8s/base/postgres-deployment.yaml')

k8s_resource('postgres', port_forwards='5432:5432')

# Redis deployment
k8s_yaml('./k8s/base/redis-deployment.yaml')

k8s_resource('redis')

# External microservices (use existing images)
k8s_yaml('./k8s/base/nlm-ingestor-deployment.yaml')
k8s_yaml('./k8s/base/docling-parser-deployment.yaml')
k8s_yaml('./k8s/base/vector-embedder-deployment.yaml')

k8s_resource('nlm-ingestor')
k8s_resource('docling-parser')
k8s_resource('vector-embedder')

print("✅ Core infrastructure services configured")
print("🔧 To add development services, run: tilt up -f Tiltfile.dev")
print("🌐 Local registry available at localhost:{}".format(REGISTRY_PORT))