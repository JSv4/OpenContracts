# Kubernetes Base Resources

This directory contains base Kubernetes manifests for OpenContracts.

## Secret Management

Secrets are managed securely using different approaches depending on the environment:

### Local Development (with Tilt)

Tilt automatically creates secrets using its secure secret extension from your `.env` files:
- Reads from `.envs/.local/.django` and `.envs/.local/.postgres`
- Creates `django-secrets` and `postgres-secrets` in the cluster
- No secrets are exposed to stdout or logs

### CI/CD (GitHub Actions)

Tilt automatically creates secrets from committed test environment files:
- Reads from `.envs/.test/.django` and `.envs/.test/.postgres`
- These files contain test-only credentials safe for CI
- Creates `django-secrets` and `postgres-secrets` in the cluster

### Production Environments

For production, use proper secret management tools:
- [Sealed Secrets](https://sealed-secrets.netlify.app/)
- [External Secrets Operator](https://external-secrets.io/)
- Cloud provider secret managers (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault)

## ConfigMaps

ConfigMaps for non-sensitive configuration are generated from `.env` files:
```bash
python tilt-helpers.py django-config    # Non-sensitive Django config
python tilt-helpers.py postgres-config  # Non-sensitive Postgres config
python tilt-helpers.py frontend-config  # Frontend configuration
```

These commands only include non-sensitive configuration values and explicitly exclude any secrets.