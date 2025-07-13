#!/usr/bin/env python3
"""
Helper functions for Tilt configuration
"""
import base64
import os
import sys

import yaml


def base64_encode(value):
    """Encode a string value to base64 for Kubernetes secrets"""
    return base64.b64encode(value.encode("utf-8")).decode("utf-8")


def read_env_file(file_path):
    """Read and parse a .env file"""
    env_vars = {}
    try:
        with open(file_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    # Remove quotes if present
                    value = value.strip().strip('"').strip("'")
                    env_vars[key.strip()] = value
    except FileNotFoundError:
        print(f"Warning: Could not read env file: {file_path}", file=sys.stderr)
    return env_vars


def generate_secret(name, env_file, secret_keys):
    """Generate a K8s Secret from environment variables"""
    env_vars = read_env_file(env_file)

    secret = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": name},
        "type": "Opaque",
        "data": {},
    }

    for key in secret_keys:
        if key in env_vars:
            secret["data"][key] = base64_encode(env_vars[key])

    return yaml.dump(secret, default_flow_style=False)


def generate_configmap(name, env_file, config_keys=None, exclude_keys=None):
    """Generate a K8s ConfigMap from environment variables"""
    env_vars = read_env_file(env_file)

    configmap = {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {"name": name},
        "data": {},
    }

    if config_keys:
        # Include only specified keys
        for key in config_keys:
            if key in env_vars:
                configmap["data"][key] = env_vars[key]
    else:
        # Include all keys except those in exclude_keys
        exclude = set(exclude_keys or [])
        for key, value in env_vars.items():
            if key not in exclude:
                configmap["data"][key] = value

    return yaml.dump(configmap, default_flow_style=False)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: tilt-helpers.py <command> [args...]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    # Determine environment from ENV variable or default to local
    env = os.environ.get("OPENCONTRACTS_ENV", "local")
    env_dir = ".envs/.test" if env == "test" else ".envs/.local"

    if command == "django-secrets":
        # Keys that should be in the Secret
        secret_keys = [
            "DJANGO_SUPERUSER_PASSWORD",
            "DJANGO_SUPERUSER_EMAIL",
            "DJANGO_SUPERUSER_USERNAME",
            "DJANGO_SECRET_KEY",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AUTH0_M2M_MANAGEMENT_API_SECRET",
            "OPENAI_API_KEY",
            "HF_TOKEN",
            "ANTHROPIC_API_KEY",
        ]
        print(generate_secret("django-secrets", f"{env_dir}/.django", secret_keys))

    elif command == "django-config":
        # Keys that should NOT be in the ConfigMap (they go in secrets)
        exclude_keys = [
            "DJANGO_SUPERUSER_PASSWORD",
            "DJANGO_SECRET_KEY",
            "AWS_SECRET_ACCESS_KEY",
            "AUTH0_M2M_MANAGEMENT_API_SECRET",
            "OPENAI_API_KEY",
            "HF_TOKEN",
            "ANTHROPIC_API_KEY",
        ]
        print(
            generate_configmap(
                "django-config", f"{env_dir}/.django", exclude_keys=exclude_keys
            )
        )

    elif command == "postgres-secrets":
        secret_keys = ["POSTGRES_PASSWORD"]
        print(generate_secret("postgres-secrets", f"{env_dir}/.postgres", secret_keys))

    elif command == "postgres-config":
        exclude_keys = ["POSTGRES_PASSWORD"]
        print(
            generate_configmap(
                "postgres-config", f"{env_dir}/.postgres", exclude_keys=exclude_keys
            )
        )

    elif command == "frontend-config":
        # Frontend config if it exists
        frontend_env = f"{env_dir}/.frontend"
        if os.path.exists(frontend_env):
            print(generate_configmap("frontend-config", frontend_env))
        else:
            # Return empty ConfigMap if no frontend env
            print(
                yaml.dump(
                    {
                        "apiVersion": "v1",
                        "kind": "ConfigMap",
                        "metadata": {"name": "frontend-config"},
                        "data": {},
                    }
                )
            )

    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)
