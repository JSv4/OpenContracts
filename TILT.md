# Tilt Development Environment

This directory contains Tilt configuration files for running OpenContracts in a local Kubernetes cluster using Kind and ctlptl.

## Prerequisites

Install the following tools:

- **Docker**: Container runtime
- **Kind**: Local Kubernetes clusters - https://kind.sigs.k8s.io/docs/user/quick-start/
- **ctlptl**: Cluster management - https://github.com/tilt-dev/ctlptl  
- **Tilt**: Development environment - https://docs.tilt.dev/install.html
- **kubectl**: Kubernetes CLI - https://kubernetes.io/docs/tasks/tools/

## Quick Start

### Windows (PowerShell)
```powershell
# Check prerequisites
.\tilt-setup.ps1 -Command check

# Start full development environment
.\tilt-setup.ps1 -Command dev

# Clean up when done
.\tilt-setup.ps1 -Command cleanup
```

### macOS/Linux (Bash)
```bash
# Check prerequisites
./tilt-setup.sh check

# Start full development environment  
./tilt-setup.sh dev

# Clean up when done
./tilt-setup.sh cleanup
```

### Cross-platform (Python)
```bash
# Check prerequisites
python tilt-setup.py check

# Start full development environment
python tilt-setup.py dev

# Clean up when done
python tilt-setup.py cleanup
```

## Manual Usage

### Core Infrastructure Only
Start just the databases and microservices:
```bash
tilt up -f Tiltfile
```

### Full Development Environment
Start everything with live reload:
```bash
tilt up -f Tiltfile.dev
```

## Architecture

### Tiltfile
- Sets up Kind cluster with local registry
- Deploys core infrastructure:
  - PostgreSQL with pgvector (persistent storage)
  - Redis cache
  - External microservices (nlm-ingestor, docling-parser, vector-embedder)
- Creates ConfigMaps and Secrets from `.envs/.local/` files

### Tiltfile.dev
- Includes all from `Tiltfile`
- Adds development services with live reload:
  - Django API server
  - Celery worker
  - Celery beat scheduler  
  - Flower monitoring
  - React frontend
- Port forwards:
  - Django: http://localhost:8000
  - Frontend: http://localhost:3000
  - Flower: http://localhost:5555

## Environment Configuration

The Tiltfiles read configuration from `.envs/.local/` and split variables into:
- **ConfigMaps**: Non-sensitive configuration
- **Secrets**: Passwords, API keys, tokens (base64 encoded)

Sensitive patterns automatically go to Secrets:
- `*PASSWORD*`, `*SECRET*`, `*KEY*`, `*TOKEN*`, `*CREDENTIALS*`

## Development Workflow

1. **Start environment**: `./tilt-setup.sh dev`
2. **View logs**: `tilt logs <service-name>`
3. **Django shell**: `kubectl exec -it deployment/django -- python manage.py shell`
4. **Database access**: `kubectl port-forward service/postgres 5432:5432`
5. **Monitor services**: Tilt UI at http://localhost:10350

## File Changes & Live Reload

### Django Backend
- **Code changes**: `opencontractserver/`, `config/` - automatic sync + restart
- **Migrations**: Automatically applied when detected
- **Requirements**: Requires image rebuild

### Frontend  
- **Code changes**: `frontend/src/`, `frontend/public/` - automatic rebuild
- **Dependencies**: `package.json` changes trigger `yarn install`

### Celery Workers
- **Code changes**: Same as Django backend - automatic sync + restart

## Troubleshooting

### Cluster Issues
```bash
# Check cluster status
ctlptl get clusters

# Reset cluster
./tilt-setup.sh cleanup
./tilt-setup.sh setup
```

### Registry Issues
```bash
# Check registry
ctlptl get registries

# Test registry connectivity
docker pull localhost:5005/hello-world || echo "Registry not accessible"
```

### Build Issues
```bash
# Force rebuild all images
tilt trigger --all

# Rebuild specific service
tilt trigger <service-name>
```

### Database Issues
```bash
# Reset PostgreSQL data
kubectl delete pvc postgres-data-pvc postgres-backups-pvc
tilt trigger postgres
```

## Cleanup

Stop everything and remove cluster:
```bash
./tilt-setup.sh cleanup
```

This removes:
- All Kubernetes resources
- Kind cluster
- Local registry
- Persistent volumes

## Comparison with Docker Compose

| Feature | Docker Compose | Tilt + Kind |
|---------|---------------|-------------|
| **Environment** | Local containers | Local Kubernetes |
| **Live Reload** | Volume mounts | Smart sync + restart |
| **Service Discovery** | Docker networks | Kubernetes services |
| **Storage** | Named volumes | Persistent volumes |
| **Scaling** | Manual | Kubernetes native |
| **Production Parity** | Good | Excellent |
| **Resource Usage** | Lower | Higher |
| **Learning Curve** | Easier | Steeper |

Choose Docker Compose for simple development, Tilt for production-like environments.