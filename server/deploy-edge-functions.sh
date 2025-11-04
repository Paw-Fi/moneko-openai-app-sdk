#!/bin/bash

# Moneko OpenAI App SDK Deployment Script
# Deploys all Supabase Edge functions with environment-based configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Supabase CLI is installed
check_supabase_cli() {
    if ! command -v supabase &> /dev/null; then
        log_error "Supabase CLI is not installed. Please install it first:"
        echo "  npm install -g supabase"
        echo "  or"
        echo "  brew install supabase/tap/supabase"
        exit 1
    fi
}

# Load environment variables
load_env() {
    local env_file="${1:-.env}"
    
    if [ ! -f "$env_file" ]; then
        log_error "Environment file not found: $env_file"
        log_info "Please create the file with your Supabase configuration:"
        echo "  EDGE_BASE_URL=https://your-project.supabase.co/functions/v1"
        echo "  EDGE_API_KEY=your_supabase_service_role_key"
        exit 1
    fi

    log_info "Loading environment from: $env_file"
    source "$env_file"
    
    if [ -z "$EDGE_BASE_URL" ] || [ -z "$EDGE_API_KEY" ]; then
        log_error "Missing required environment variables:"
        echo "  - EDGE_BASE_URL: Your Supabase project functions URL"
        echo "  - EDGE_API_KEY: Your Supabase service role key"
        exit 1
    fi
    
    # Extract project reference from EDGE_BASE_URL
    export PROJECT_REF=$(echo "$EDGE_BASE_URL" | sed -n 's|https://\([^.]*\).*|\1|p')
    
    if [ -z "$PROJECT_REF" ]; then
        log_error "Could not extract project reference from EDGE_BASE_URL"
        exit 1
    fi
    
    log_success "Environment loaded successfully"
    log_info "Project: $PROJECT_REF"
}

# Deploy all functions
deploy_all_functions() {
    local functions_dir="supabase/functions"
    local failed_deployments=()
    local successful_deployments=()
    
    if [ ! -d "$functions_dir" ]; then
        log_error "Functions directory not found: $functions_dir"
        exit 1
    fi
    
    log_info "Scanning for functions in: $functions_dir"
    echo ""
    
    # Find all function directories
    local total_functions=0
    for function_dir in "$functions_dir"/*; do
        if [ -d "$function_dir" ]; then
            function_name=$(basename "$function_dir")
            
            # Check if index.ts exists
            if [ -f "$function_dir/index.ts" ]; then
                total_functions=$((total_functions + 1))
                echo "📦 [$total_functions] Deploying $function_name function..."
                
                if supabase functions deploy "$function_name" --project-ref $PROJECT_REF; then
                    echo "✅ $function_name deployed"
                    successful_deployments+=("$function_name")
                else
                    echo "❌ Failed to deploy $function_name"
                    failed_deployments+=("$function_name")
                fi
                echo ""
            else
                log_warning "Skipping $function_name: no index.ts found"
            fi
        fi
    done
    
    # Summary
    log_info "Deployment Summary:"
    echo "===================="
    
    if [ ${#successful_deployments[@]} -gt 0 ]; then
        log_success "Successfully deployed (${#successful_deployments[@]}):"
        for func in "${successful_deployments[@]}"; do
            echo "  ✓ $func"
        done
    fi
    
    if [ ${#failed_deployments[@]} -gt 0 ]; then
        log_error "Failed to deploy (${#failed_deployments[@]}):"
        for func in "${failed_deployments[@]}"; do
            echo "  ✗ $func"
        done
        exit 1
    fi
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check if functions are accessible
    local test_url="${EDGE_BASE_URL}/get-budget"
    
    if curl -s -o /dev/null -w "%{http_code}" "$test_url" | grep -q "200\|400\|401"; then
        log_success "✓ Functions are accessible at: $EDGE_BASE_URL"
    else
        log_warning "⚠ Functions may not be fully accessible yet (this is normal for new deployments)"
    fi
}

# Main deployment function
main() {
    local env_file="${1:-.env}"
    
    echo "🚀 Moneko Supabase Deployment Script"
    echo "====================================="
    echo
    
    # Check prerequisites
    check_supabase_cli
    
    # Load environment
    load_env "$env_file"
    
    # Deploy functions
    deploy_all_functions
    
    # Verify deployment
    verify_deployment
    
    echo
    log_success "🎉 All functions deployed successfully!"
    echo
    log_info "Your MCP server can now connect to:"
    echo "  $EDGE_BASE_URL"
    echo
}

# Help function
show_help() {
    echo "Moneko Supabase Deployment Script"
    echo "================================="
    echo
    echo "Usage: $0 [ENV_FILE]"
    echo
    echo "Arguments:"
    echo "  ENV_FILE    Path to environment file (default: .env)"
    echo
    echo "Examples:"
    echo "  $0                    # Use default env file"
    echo "  $0 prod.env          # Use production env file"
    echo
    echo "Required environment variables:"
    echo "  EDGE_BASE_URL    Your Supabase project functions URL"
    echo "  EDGE_API_KEY     Your Supabase service role key"
}

# Parse command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
