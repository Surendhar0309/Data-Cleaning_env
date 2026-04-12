#!/bin/bash

# Data Cleaning Environment - Quick Start Script
# Usage: bash quickstart.sh [option]
# Options: validate, run-server, run-baseline, docker-build, help

set -e

PROJECT_NAME="Data Cleaning & Analytics Environment"
VERSION="1.0.0"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}${PROJECT_NAME}${NC}"
    echo -e "${BLUE}Version: ${VERSION}${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

check_python() {
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed"
        exit 1
    fi
    
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    print_success "Python ${PYTHON_VERSION} found"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_info "Docker is not installed (required for docker-build option)"
        return 1
    fi
    
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | sed 's/,//')
    print_success "Docker ${DOCKER_VERSION} found"
    return 0
}

validate_spec() {
    echo ""
    print_header
    echo -e "${YELLOW}Running OpenEnv Spec Validation...${NC}\n"
    
    if [ ! -f "validate.py" ]; then
        print_error "validate.py not found in current directory"
        exit 1
    fi
    
    python3 validate.py
    
    if [ $? -eq 0 ]; then
        echo ""
        print_success "All validations passed!"
        echo ""
    else
        print_error "Some validations failed"
        exit 1
    fi
}

install_dependencies() {
    echo ""
    echo -e "${YELLOW}Installing dependencies...${NC}\n"
    
    if [ ! -f "requirements.txt" ]; then
        print_error "requirements.txt not found"
        exit 1
    fi
    
    # Try to install with pip
    if python3 -m pip install -q -r requirements.txt; then
        print_success "Dependencies installed"
    else
        print_error "Failed to install dependencies"
        print_info "Try: pip install --upgrade pip"
        exit 1
    fi
}

run_server() {
    echo ""
    print_header
    echo -e "${YELLOW}Starting Data Cleaning Environment Server...${NC}\n"
    
    if [ ! -f "server.py" ]; then
        print_error "server.py not found"
        exit 1
    fi
    
    print_info "Dependencies check..."
    check_python
    
    # Try to install deps if not already
    python3 -c "import fastapi" 2>/dev/null || install_dependencies
    
    echo ""
    print_info "Server starting on http://localhost:7860"
    print_info "Press Ctrl+C to stop\n"
    
    python3 server.py
}

run_baseline() {
    echo ""
    print_header
    echo -e "${YELLOW}Running Baseline Agent...${NC}\n"
    
    if [ ! -f "baseline_inference.py" ]; then
        print_error "baseline_inference.py not found"
        exit 1
    fi
    
    print_info "Prerequisites check..."
    check_python
    
    # Try to install deps if not already
    python3 -c "import requests" 2>/dev/null || install_dependencies
    
    echo ""
    print_info "Running baseline on all tasks...\n"
    
    python3 baseline_inference.py
    
    if [ -f "baseline_results.json" ]; then
        echo ""
        print_success "Results saved to baseline_results.json"
    fi
}

docker_build() {
    echo ""
    print_header
    echo -e "${YELLOW}Building Docker Image...${NC}\n"
    
    if ! check_docker; then
        print_error "Docker is required for this command"
        print_info "Install Docker from: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if [ ! -f "Dockerfile" ]; then
        print_error "Dockerfile not found"
        exit 1
    fi
    
    IMAGE_NAME="data-cleaning-env:latest"
    
    print_info "Building image: ${IMAGE_NAME}\n"
    
    docker build -t "${IMAGE_NAME}" .
    
    if [ $? -eq 0 ]; then
        echo ""
        print_success "Docker image built successfully"
        echo ""
        echo "Run the container with:"
        echo -e "${BLUE}docker run -p 7860:7860 ${IMAGE_NAME}${NC}\n"
    else
        print_error "Docker build failed"
        exit 1
    fi
}

docker_run() {
    echo ""
    print_header
    echo -e "${YELLOW}Running Docker Container...${NC}\n"
    
    if ! check_docker; then
        print_error "Docker is required"
        exit 1
    fi
    
    IMAGE_NAME="data-cleaning-env:latest"
    
    # Check if image exists
    if ! docker image inspect "${IMAGE_NAME}" > /dev/null 2>&1; then
        print_info "Image not found. Building first...\n"
        docker_build
    fi
    
    print_info "Starting container on http://localhost:7860"
    print_info "Press Ctrl+C to stop\n"
    
    docker run -p 7860:7860 "${IMAGE_NAME}"
}

test_endpoint() {
    echo ""
    print_header
    echo -e "${YELLOW}Testing API Endpoint...${NC}\n"
    
    if ! command -v curl &> /dev/null; then
        print_error "curl is not installed"
        exit 1
    fi
    
    URL="http://localhost:7860/"
    
    print_info "Testing: ${URL}\n"
    
    if response=$(curl -s "${URL}" 2>/dev/null); then
        print_success "Endpoint is responsive"
        echo ""
        echo "Response:"
        echo "${response}" | python3 -m json.tool 2>/dev/null || echo "${response}"
        echo ""
    else
        print_error "Could not reach endpoint"
        print_info "Make sure server is running: bash quickstart.sh run-server"
        exit 1
    fi
}

show_help() {
    print_header
    cat << EOF
USAGE:
    bash quickstart.sh [option]

OPTIONS:
    validate         Run OpenEnv spec compliance validation
    install-deps     Install Python dependencies
    run-server       Start the FastAPI server
    run-baseline     Run baseline heuristic agent
    test-endpoint    Test API endpoint (requires server running)
    docker-build     Build Docker image
    docker-run       Run Docker container
    help             Show this help message

EXAMPLES:
    # Validate spec compliance
    bash quickstart.sh validate

    # Start server
    bash quickstart.sh run-server

    # Run baseline agent (in another terminal)
    bash quickstart.sh run-baseline

    # Build and run Docker container
    bash quickstart.sh docker-build
    bash quickstart.sh docker-run

    # Test API endpoint (with server running)
    bash quickstart.sh test-endpoint

QUICK START:
    1. Install dependencies:     bash quickstart.sh install-deps
    2. Validate spec:            bash quickstart.sh validate
    3. Start server:             bash quickstart.sh run-server
    4. In another terminal:      bash quickstart.sh run-baseline

ENDPOINTS (when server is running):
    Health:  GET  http://localhost:7860/
    Reset:   POST http://localhost:7860/reset
    Step:    POST http://localhost:7860/step
    State:   POST http://localhost:7860/state
    Grader:  POST http://localhost:7860/grader
    Tasks:   GET  http://localhost:7860/tasks
    Baseline: POST http://localhost:7860/baseline

DOCUMENTATION:
    - README.md              Full documentation
    - DEPLOYMENT_GUIDE.md    Deployment instructions
    - openenv.yaml           OpenEnv specification

SUPPORT:
    Email: ksurendhar95@gmail.com

EOF
}

# Main script
main() {
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi
    
    case "$1" in
        validate)
            validate_spec
            ;;
        install-deps)
            check_python
            install_dependencies
            ;;
        run-server)
            run_server
            ;;
        run-baseline)
            run_baseline
            ;;
        test-endpoint)
            test_endpoint
            ;;
        docker-build)
            docker_build
            ;;
        docker-run)
            docker_run
            ;;
        help)
            show_help
            ;;
        *)
            print_error "Unknown option: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
