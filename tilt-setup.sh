#!/bin/bash
# Helper script for OpenContracts Tilt development setup (macOS/Linux)

set -e

CLUSTER_NAME="opencontracts-local"
REGISTRY_NAME="opencontracts-registry"
REGISTRY_PORT="5005"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if ctlptl is installed
    if ! command -v ctlptl &> /dev/null; then
        print_error "ctlptl is not installed. Please install it first:"
        echo "  https://github.com/tilt-dev/ctlptl"
        exit 1
    fi
    
    # Check if tilt is installed
    if ! command -v tilt &> /dev/null; then
        print_error "tilt is not installed. Please install it first:"
        echo "  https://docs.tilt.dev/install.html"
        exit 1
    fi
    
    # Check if kind is installed
    if ! command -v kind &> /dev/null; then
        print_error "kind is not installed. Please install it first:"
        echo "  https://kind.sigs.k8s.io/docs/user/quick-start/"
        exit 1
    fi
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install it first:"
        echo "  https://kubernetes.io/docs/tasks/tools/"
        exit 1
    fi
    
    print_success "All prerequisites are installed"
}

setup_cluster() {
    print_status "Setting up Kind cluster and local registry..."
    
    # Create registry if it doesn't exist
    if ! ctlptl get registry $REGISTRY_NAME &> /dev/null; then
        print_status "Creating local registry..."
        ctlptl create registry $REGISTRY_NAME --port $REGISTRY_PORT
    else
        print_success "Registry $REGISTRY_NAME already exists"
    fi
    
    # Create cluster if it doesn't exist
    if ! ctlptl get cluster kind --name $CLUSTER_NAME &> /dev/null; then
        print_status "Creating Kind cluster..."
        ctlptl create cluster kind --registry $REGISTRY_NAME --name $CLUSTER_NAME
    else
        print_success "Cluster $CLUSTER_NAME already exists"
    fi
    
    print_success "Cluster and registry setup complete"
}

start_infrastructure() {
    print_status "Starting core infrastructure services..."
    tilt up --file Tiltfile
}

start_development() {
    print_status "Starting full development environment..."
    tilt up --file Tiltfile.dev
}

cleanup() {
    print_status "Cleaning up resources..."
    
    # Stop Tilt
    tilt down 2>/dev/null || true
    
    # Delete cluster
    if ctlptl get cluster kind --name $CLUSTER_NAME &> /dev/null; then
        print_status "Deleting cluster $CLUSTER_NAME..."
        ctlptl delete cluster kind --name $CLUSTER_NAME
    fi
    
    # Delete registry
    if ctlptl get registry $REGISTRY_NAME &> /dev/null; then
        print_status "Deleting registry $REGISTRY_NAME..."
        ctlptl delete registry $REGISTRY_NAME
    fi
    
    print_success "Cleanup complete"
}

show_info() {
    print_status "System Information:"
    echo "  Platform: $(uname -s) $(uname -r)"
    echo "  Shell: $SHELL"
    echo "  Working Directory: $(pwd)"
    echo ""
    
    print_status "Tilt Configuration:"
    echo "  Cluster Name: $CLUSTER_NAME"
    echo "  Registry Name: $REGISTRY_NAME"
    echo "  Registry Port: $REGISTRY_PORT"
    echo ""
    
    print_status "Tool Status:"
    for tool in ctlptl tilt kind kubectl docker; do
        if command -v $tool &> /dev/null; then
            echo "  $tool: ✓"
        else
            echo "  $tool: ✗"
        fi
    done
}

show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  check       - Check prerequisites"
    echo "  setup       - Setup Kind cluster and registry"
    echo "  infra       - Start core infrastructure only"
    echo "  dev         - Start full development environment"
    echo "  cleanup     - Clean up all resources"
    echo "  info        - Show system and tool information"
    echo "  help        - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 check                    # Check if all tools are installed"
    echo "  $0 setup                    # Setup cluster and registry"
    echo "  $0 dev                      # Start development environment"
    echo "  $0 cleanup                  # Clean up everything"
}

# Main script logic
case "${1:-help}" in
    check)
        check_prerequisites
        ;;
    setup)
        check_prerequisites
        setup_cluster
        ;;
    infra)
        check_prerequisites
        setup_cluster
        start_infrastructure
        ;;
    dev)
        check_prerequisites
        setup_cluster
        start_development
        ;;
    cleanup)
        cleanup
        ;;
    info)
        show_info
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac