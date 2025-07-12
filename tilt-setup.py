#!/usr/bin/env python3
"""
Cross-platform helper script for OpenContracts Tilt development setup
Works on Windows, macOS, and Linux
"""

import argparse
import subprocess
import sys
import platform
import shutil
from pathlib import Path

# Configuration
CLUSTER_NAME = "kind-opencontracts-local"
REGISTRY_NAME = "opencontracts-registry"
REGISTRY_PORT = "5005"

# Colors for output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

def print_status(message):
    print(f"{Colors.BLUE}[INFO]{Colors.NC} {message}")

def print_success(message):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")

def print_warning(message):
    print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")

def print_error(message):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")

def run_command(cmd, shell=True, check=True):
    """Run a command and handle errors"""
    try:
        if isinstance(cmd, str):
            result = subprocess.run(cmd, shell=shell, check=check, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        else:
            result = subprocess.run(cmd, check=check, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        return result
    except subprocess.CalledProcessError as e:
        if check:
            print_error(f"Command failed: {cmd}")
            print_error(f"Error: {e.stderr}")
            sys.exit(1)
        return e

def check_command(command):
    """Check if a command exists in PATH"""
    return shutil.which(command) is not None

def check_prerequisites():
    """Check if all required tools are installed"""
    print_status("Checking prerequisites...")
    
    required_tools = {
        'ctlptl': 'https://github.com/tilt-dev/ctlptl',
        'tilt': 'https://docs.tilt.dev/install.html',
        'kind': 'https://kind.sigs.k8s.io/docs/user/quick-start/',
        'kubectl': 'https://kubernetes.io/docs/tasks/tools/'
    }
    
    missing_tools = []
    for tool, url in required_tools.items():
        if not check_command(tool):
            missing_tools.append((tool, url))
    
    if missing_tools:
        print_error("Missing required tools:")
        for tool, url in missing_tools:
            print(f"  - {tool}: {url}")
        sys.exit(1)
    
    print_success("All prerequisites are installed")

def cluster_exists():
    """Check if the cluster exists"""
    try:
        result = run_command(f"ctlptl get cluster {CLUSTER_NAME}", check=False)
        return result.returncode == 0
    except:
        return False

def registry_exists():
    """Check if the registry exists"""
    try:
        result = run_command(f"ctlptl get registry {REGISTRY_NAME}", check=False)
        return result.returncode == 0
    except:
        return False

def setup_cluster():
    """Setup Kind cluster and local registry"""
    print_status("Setting up Kind cluster and local registry...")
    
    # Create registry if it doesn't exist
    if not registry_exists():
        print_status("Creating local registry...")
        run_command(f"ctlptl create registry {REGISTRY_NAME} --port {REGISTRY_PORT}")
    else:
        print_success(f"Registry {REGISTRY_NAME} already exists")
    
    # Create cluster if it doesn't exist
    if not cluster_exists():
        print_status("Creating Kind cluster...")
        run_command(f"ctlptl create cluster kind --registry {REGISTRY_NAME} --name {CLUSTER_NAME}")
    else:
        print_success(f"Cluster {CLUSTER_NAME} already exists")
    
    print_success("Cluster and registry setup complete")

def start_infrastructure():
    """Start core infrastructure services"""
    print_status("Starting core infrastructure services...")
    print_status("Tilt output will be shown below. Press Ctrl+C to stop.")
    try:
        # Run tilt with live output
        subprocess.run("tilt up --file Tiltfile", shell=True, check=True)
    except KeyboardInterrupt:
        print_warning("Interrupted by user")
        sys.exit(0)

def start_development():
    """Start full development environment"""
    print_status("Starting full development environment...")
    print_status("Tilt output will be shown below. Press Ctrl+C to stop.")
    try:
        # Run tilt with live output
        subprocess.run("tilt up --file Tiltfile.dev", shell=True, check=True)
    except KeyboardInterrupt:
        print_warning("Interrupted by user")
        sys.exit(0)

def cleanup():
    """Clean up all resources"""
    print_status("Cleaning up resources...")
    
    # Stop Tilt
    try:
        run_command("tilt down", check=False)
    except:
        pass
    
    # Delete cluster
    if cluster_exists():
        print_status(f"Deleting cluster {CLUSTER_NAME}...")
        run_command(f"ctlptl delete cluster {CLUSTER_NAME}")
    
    # Delete registry
    if registry_exists():
        print_status(f"Deleting registry {REGISTRY_NAME}...")
        run_command(f"ctlptl delete registry {REGISTRY_NAME}")
    
    print_success("Cleanup complete")

def show_info():
    """Show system and setup information"""
    print_status("System Information:")
    print(f"  Platform: {platform.system()} {platform.release()}")
    print(f"  Python: {sys.version}")
    print(f"  Working Directory: {Path.cwd()}")
    print()
    
    print_status("Tilt Configuration:")
    print(f"  Cluster Name: {CLUSTER_NAME}")
    print(f"  Registry Name: {REGISTRY_NAME}")
    print(f"  Registry Port: {REGISTRY_PORT}")
    print()
    
    print_status("Tool Status:")
    tools = ['ctlptl', 'tilt', 'kind', 'kubectl', 'docker']
    for tool in tools:
        status = "✓" if check_command(tool) else "✗"
        print(f"  {tool}: {status}")

def main():
    parser = argparse.ArgumentParser(
        description="OpenContracts Tilt development setup helper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tilt-setup.py check      # Check if all tools are installed
  python tilt-setup.py setup      # Setup cluster and registry
  python tilt-setup.py dev        # Start development environment
  python tilt-setup.py cleanup    # Clean up everything
        """
    )
    
    parser.add_argument(
        'command',
        choices=['check', 'setup', 'infra', 'dev', 'cleanup', 'info'],
        help='Command to execute'
    )
    
    args = parser.parse_args()
    
    if args.command == 'check':
        check_prerequisites()
    elif args.command == 'setup':
        check_prerequisites()
        setup_cluster()
    elif args.command == 'infra':
        check_prerequisites()
        setup_cluster()
        start_infrastructure()
    elif args.command == 'dev':
        check_prerequisites()
        setup_cluster()
        start_development()
    elif args.command == 'cleanup':
        cleanup()
    elif args.command == 'info':
        show_info()

if __name__ == '__main__':
    main()