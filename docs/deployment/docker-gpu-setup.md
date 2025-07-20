# Docker GPU Setup and CI/CD Workflows

## Overview

This guide covers the GPU-enabled Docker setup for OpenContracts and the GitHub Actions workflows for building and publishing container images.

## GPU Support

### Prerequisites

1. **NVIDIA GPU** with CUDA support
2. **NVIDIA Container Toolkit** installed on your host system
3. **Docker** with GPU support enabled

### Windows Setup (WSL2)

```powershell
# Install WSL2
wsl --install

# Install NVIDIA drivers for WSL2
# Download from: https://developer.nvidia.com/cuda/wsl

# Verify GPU is accessible
docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu24.04 nvidia-smi
```

### Linux Setup

```bash
# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker

# Verify GPU is accessible
docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu24.04 nvidia-smi
```

## Docker Images

### Base Images

All Django-based services now use the PyTorch CUDA base image:
- Base: `pytorch/pytorch:2.7.1-cuda12.6-cudnn9-runtime`
- Includes: PyTorch 2.7.1, CUDA 12.6, cuDNN 9

### Environment Variables

The following CUDA-specific environment variables are configured:
- `CUDA_MODULE_LOADING=LAZY` - Improves startup time
- `TORCH_CUDA_ARCH_LIST` - Supports GPU architectures 6.0-9.0
- `CUDA_VISIBLE_DEVICES=0` - Default to first GPU
- `PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512` - Memory optimization

## GitHub Workflows

### 1. Tagged Release Workflow (`docker-build-release.yml`)

Automatically builds and publishes images when a new release is created.

**Triggers on:**
- Release publication

**Images built:**
- `ghcr.io/[owner]/opencontractserver_django:[version]` - Used by django, celeryworker, celerybeat, and flower services
- `ghcr.io/[owner]/opencontractserver_frontend:[version]`
- `ghcr.io/[owner]/opencontractserver_postgres:[version]`
- `ghcr.io/[owner]/opencontractserver_traefik:[version]`

### 2. CUDA Build Workflow (`docker-build-cuda.yml`)

Builds GPU-enabled images with CUDA support.

**Triggers on:**
- Manual workflow dispatch
- Push to main branch (when Dockerfiles change)

**Images built:**
- `ghcr.io/[owner]/opencontractserver_django:cuda-latest` - GPU-enabled image used by django, celeryworker, celerybeat, and flower services

## Using Pre-built Images

### Production Deployment with Pre-built Images

Use `production-ghcr.yml` to deploy with pre-built images:

```bash
# Using latest images
GITHUB_REPOSITORY_OWNER=yourusername docker-compose -f production-ghcr.yml up -d

# Using specific version
GITHUB_REPOSITORY_OWNER=yourusername TAG=v1.2.3 docker-compose -f production-ghcr.yml up -d

# Using CUDA-enabled images
GITHUB_REPOSITORY_OWNER=yourusername TAG=cuda-latest docker-compose -f production-ghcr.yml up -d
```

### Local Development

For local development, continue using the standard compose files:

```bash
# Build locally
docker-compose -f local.yml build

# Run with GPU support
docker-compose -f local.yml up
```

## Verifying GPU Support

### Check GPU availability in container

```bash
# Enter django container
docker-compose -f local.yml exec django bash

# Inside container, run Python
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU count: {torch.cuda.device_count()}')"
```

### Monitor GPU usage

```bash
# On host system
nvidia-smi -l 1  # Updates every second
```

## Troubleshooting

### GPU not detected

1. Verify NVIDIA Container Toolkit installation:
   ```bash
   nvidia-container-cli info
   ```

2. Check Docker daemon configuration:
   ```bash
   docker info | grep nvidia
   ```

3. Ensure GPU is not being used by other processes:
   ```bash
   nvidia-smi
   ```

### Out of memory errors

Adjust `PYTORCH_CUDA_ALLOC_CONF`:
```yaml
environment:
  - PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128  # Reduce if OOM
```

### Performance optimization

For multi-GPU systems, specify which GPUs to use:
```yaml
environment:
  - CUDA_VISIBLE_DEVICES=0,1  # Use first two GPUs
```

## CI/CD Best Practices

1. **Tag releases properly**: Use semantic versioning (e.g., v1.2.3)
2. **Test locally first**: Build and test images locally before pushing
3. **Monitor builds**: Check GitHub Actions for build status
4. **Use specific tags**: Avoid using `latest` in production
5. **Clean up old images**: Periodically remove unused images from the registry
