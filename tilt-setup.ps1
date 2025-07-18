# PowerShell helper script for OpenContracts Tilt development setup (Windows)

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("check", "setup", "infra", "dev", "cleanup", "info")]
    [string]$Command
)

# Configuration
$CLUSTER_NAME = "opencontracts-local"
$REGISTRY_NAME = "opencontracts-registry"
$REGISTRY_PORT = "5005"

# Colors for output
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Warning { Write-Host "[WARNING] $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }

function Test-CommandExists {
    param($Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Invoke-SafeCommand {
    param(
        [string]$Command,
        [bool]$ThrowOnError = $true
    )

    try {
        Write-Host "Executing: $Command" -ForegroundColor Gray
        Invoke-Expression $Command
        if ($LASTEXITCODE -ne 0 -and $ThrowOnError) {
            throw "Command failed with exit code $LASTEXITCODE"
        }
        return $LASTEXITCODE -eq 0
    }
    catch {
        if ($ThrowOnError) {
            Write-Error "Command failed: $Command"
            Write-Error $_.Exception.Message
            exit 1
        }
        return $false
    }
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."

    $requiredTools = @{
        'ctlptl' = 'https://github.com/tilt-dev/ctlptl'
        'tilt' = 'https://docs.tilt.dev/install.html'
        'kind' = 'https://kind.sigs.k8s.io/docs/user/quick-start/'
        'kubectl' = 'https://kubernetes.io/docs/tasks/tools/'
    }

    $missingTools = @()
    foreach ($tool in $requiredTools.Keys) {
        if (-not (Test-CommandExists $tool)) {
            $missingTools += @{Tool = $tool; Url = $requiredTools[$tool]}
        }
    }

    if ($missingTools.Count -gt 0) {
        Write-Error "Missing required tools:"
        foreach ($missing in $missingTools) {
            Write-Host "  - $($missing.Tool): $($missing.Url)" -ForegroundColor Red
        }
        exit 1
    }

    Write-Success "All prerequisites are installed"
}

function Test-ClusterExists {
    return Invoke-SafeCommand "ctlptl get cluster kind --name $CLUSTER_NAME" -ThrowOnError $false
}

function Test-RegistryExists {
    return Invoke-SafeCommand "ctlptl get registry $REGISTRY_NAME" -ThrowOnError $false
}

function Initialize-Cluster {
    Write-Info "Setting up Kind cluster and local registry..."

    # Create registry if it doesn't exist
    if (-not (Test-RegistryExists)) {
        Write-Info "Creating local registry..."
        Invoke-SafeCommand "ctlptl create registry $REGISTRY_NAME --port $REGISTRY_PORT"
    } else {
        Write-Success "Registry $REGISTRY_NAME already exists"
    }

    # Create cluster if it doesn't exist
    if (-not (Test-ClusterExists)) {
        Write-Info "Creating Kind cluster..."
        Invoke-SafeCommand "ctlptl create cluster kind --registry $REGISTRY_NAME --name $CLUSTER_NAME"
    } else {
        Write-Success "Cluster $CLUSTER_NAME already exists"
    }

    Write-Success "Cluster and registry setup complete"
}

function Start-Infrastructure {
    Write-Info "Starting core infrastructure services..."
    Invoke-SafeCommand "tilt up --file Tiltfile"
}

function Start-Development {
    Write-Info "Starting full development environment..."
    Invoke-SafeCommand "tilt up --file Tiltfile.dev"
}

function Remove-Environment {
    Write-Info "Cleaning up resources..."

    # Stop Tilt
    Invoke-SafeCommand "tilt down" -ThrowOnError $false

    # Delete cluster
    if (Test-ClusterExists) {
        Write-Info "Deleting cluster $CLUSTER_NAME..."
        Invoke-SafeCommand "ctlptl delete cluster kind --name $CLUSTER_NAME"
    }

    # Delete registry
    if (Test-RegistryExists) {
        Write-Info "Deleting registry $REGISTRY_NAME..."
        Invoke-SafeCommand "ctlptl delete registry $REGISTRY_NAME"
    }

    Write-Success "Cleanup complete"
}

function Show-Info {
    Write-Info "System Information:"
    Write-Host "  Platform: Windows $([Environment]::OSVersion.Version)"
    Write-Host "  PowerShell: $($PSVersionTable.PSVersion)"
    Write-Host "  Working Directory: $(Get-Location)"
    Write-Host ""

    Write-Info "Tilt Configuration:"
    Write-Host "  Cluster Name: $CLUSTER_NAME"
    Write-Host "  Registry Name: $REGISTRY_NAME"
    Write-Host "  Registry Port: $REGISTRY_PORT"
    Write-Host ""

    Write-Info "Tool Status:"
    $tools = @('ctlptl', 'tilt', 'kind', 'kubectl', 'docker')
    foreach ($tool in $tools) {
        $status = if (Test-CommandExists $tool) { "✓" } else { "✗" }
        Write-Host "  $tool`: $status"
    }
}

function Show-Usage {
    Write-Host @"
Usage: .\tilt-setup.ps1 -Command <command>

Commands:
  check       - Check prerequisites
  setup       - Setup Kind cluster and registry
  infra       - Start core infrastructure only
  dev         - Start full development environment
  cleanup     - Clean up all resources
  info        - Show system and tool information

Examples:
  .\tilt-setup.ps1 -Command check
  .\tilt-setup.ps1 -Command setup
  .\tilt-setup.ps1 -Command dev
  .\tilt-setup.ps1 -Command cleanup
"@
}

# Main script logic
switch ($Command) {
    "check" {
        Test-Prerequisites
    }
    "setup" {
        Test-Prerequisites
        Initialize-Cluster
    }
    "infra" {
        Test-Prerequisites
        Initialize-Cluster
        Start-Infrastructure
    }
    "dev" {
        Test-Prerequisites
        Initialize-Cluster
        Start-Development
    }
    "cleanup" {
        Remove-Environment
    }
    "info" {
        Show-Info
    }
    default {
        Write-Error "Unknown command: $Command"
        Show-Usage
        exit 1
    }
}
