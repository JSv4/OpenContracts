#!/usr/bin/env python3
"""
Helper functions for Tilt configuration
"""
import base64
import os

def base64_encode(value):
    """Encode a string value to base64 for Kubernetes secrets"""
    return base64.b64encode(value.encode('utf-8')).decode('utf-8')

def read_env_file(file_path):
    """Read and parse a .env file"""
    env_vars = {}
    try:
        with open(file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    except FileNotFoundError:
        print(f"Warning: Could not read env file: {file_path}")
    return env_vars

if __name__ == "__main__":
    # Can be used for testing
    pass