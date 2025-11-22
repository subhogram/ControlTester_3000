#!/bin/bash

# Agent-Assess Build Script
# Usage: ./make.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Show help
show_help() {
    cat << EOF
Agent-Assess Build Script

Usage: ./make.sh [command]

Commands:
  install           Install dependencies
  dev               Start development server
  build             Build for production
  start             Start production server
  test              Run tests
  clean             Clean build artifacts and dependencies
  
Docker Commands:
  docker-build      Build Docker image
  docker-up         Start Docker containers
  docker-down       Stop Docker containers
  docker-restart    Restart Docker containers
  docker-logs       View Docker logs
  docker-shell      Open shell in running container
  
Utility Commands:
  check             Check if all required tools are installed
  help              Show this help message

Examples:
  ./make.sh install         # Install all dependencies
  ./make.sh dev             # Start development server
  ./make.sh docker-up       # Start with Docker Compose
  ./make.sh docker-logs     # View application logs

EOF
}

# Check if required tools are installed
check_dependencies() {
    print_info "Checking dependencies..."
    
    local missing=0
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        missing=1
    else
        print_info "Node.js $(node --version) ✓"
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        missing=1
    else
        print_info "npm $(npm --version) ✓"
    fi
    
    if ! command -v docker &> /dev/null; then
        print_warning "Docker is not installed (optional for Docker commands)"
    else
        print_info "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') ✓"
    fi
    
    if [ $missing -eq 1 ]; then
        print_error "Some required dependencies are missing"
        exit 1
    fi
    
    print_info "All required dependencies are installed ✓"
}

# Install dependencies
install() {
    print_info "Installing dependencies..."
    npm install
    print_info "Dependencies installed successfully ✓"
}

# Start development server
dev() {
    print_info "Starting development server..."
    npm run dev
}

# Build for production
build() {
    print_info "Building for production..."
    npm run build
    print_info "Build completed successfully ✓"
}

# Start production server
start() {
    print_info "Starting production server..."
    npm run start
}

# Run tests
run_tests() {
    print_info "Running tests..."
    if [ -f "package.json" ] && grep -q "\"test\"" package.json; then
        npm test
    else
        print_warning "No test script found in package.json"
    fi
}

# Clean build artifacts
clean() {
    print_info "Cleaning build artifacts..."
    
    rm -rf dist
    rm -rf node_modules
    rm -rf .vite
    rm -rf .cache
    
    print_info "Clean completed successfully ✓"
}

# Docker commands
docker_build() {
    print_info "Building Docker image..."
    docker-compose build
    print_info "Docker image built successfully ✓"
}

docker_up() {
    print_info "Starting Docker containers..."
    docker-compose up -d
    print_info "Docker containers started ✓"
    print_info "Application available at http://localhost:5000"
}

docker_down() {
    print_info "Stopping Docker containers..."
    docker-compose down
    print_info "Docker containers stopped ✓"
}

docker_restart() {
    print_info "Restarting Docker containers..."
    docker-compose restart
    print_info "Docker containers restarted ✓"
}

docker_logs() {
    print_info "Showing Docker logs (Ctrl+C to exit)..."
    docker-compose logs -f
}

docker_shell() {
    print_info "Opening shell in container..."
    docker-compose exec web_ui_agent sh
}

# Main script logic
case "${1:-help}" in
    install)
        install
        ;;
    dev)
        dev
        ;;
    build)
        build
        ;;
    start)
        start
        ;;
    test)
        run_tests
        ;;
    clean)
        clean
        ;;
    docker-build)
        docker_build
        ;;
    docker-up)
        docker_up
        ;;
    docker-down)
        docker_down
        ;;
    docker-restart)
        docker_restart
        ;;
    docker-logs)
        docker_logs
        ;;
    docker-shell)
        docker_shell
        ;;
    check)
        check_dependencies
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
