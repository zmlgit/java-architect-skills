#!/bin/bash
# PMD Bootstrap Script (Bash version)
# Automatically downloads and configures PMD for Spring Reviewer

set -euo pipefail

# Configuration
PMD_VERSION="7.0.0"
PMD_URLS=(
    "https://github.com/pmd/pmd/releases/download/pmd_releases%2F${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip"
    "https://sourceforge.net/projects/pmd/files/pmd/${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip/download"
    "https://repo1.maven.org/maven2/net/sourceforge/pmd/pmd-dist/${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip"
)
TOOLS_DIR="${HOME}/.spring-reviewer/tools"
PMD_DIR="${TOOLS_DIR}/pmd-bin-${PMD_VERSION}"
PMD_BIN="${PMD_DIR}/bin/pmd"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "${BLUE}▸${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_header() {
    echo -e "${BOLD}"
    echo "════════════════════════════════════════════════════════════"
    echo "  Spring Reviewer - PMD Bootstrap"
    echo "════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

# Check if PMD is installed
check_pmd_installed() {
    if [ -f "${PMD_BIN}" ]; then
        print_success "PMD ${PMD_VERSION} already installed at ${PMD_DIR}"
        return 0
    fi
    return 1
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        missing_deps+=("curl or wget")
    fi

    if ! command -v unzip &> /dev/null; then
        missing_deps+=("unzip")
    fi

    if ! command -v java &> /dev/null; then
        missing_deps+=("java")
    fi

    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        echo ""
        echo "Please install the missing dependencies:"
        echo "  - On Ubuntu/Debian: sudo apt-get install curl unzip openjdk-11-jre"
        echo "  - On macOS: brew install curl unzip openjdk@11"
        echo "  - On RHEL/CentOS: sudo yum install curl unzip java-11-openjdk"
        exit 1
    fi
}

# Download PMD
download_file() {
    local url="$1"
    local target="$2"
    
    print_step "Attempting download from: ${url}"
    
    if command -v curl &> /dev/null; then
        if curl -L --progress-bar "${url}" -o "${target}"; then
            echo ""
            return 0
        fi
    elif command -v wget &> /dev/null; then
        if wget --show-progress "${url}" -O "${target}"; then
            echo ""
            return 0
        fi
    fi
    
    return 1
}

download_pmd() {
    print_step "Looking for PMD ${PMD_VERSION}..."

    mkdir -p "${TOOLS_DIR}"
    local zip_path="${TOOLS_DIR}/pmd-${PMD_VERSION}.zip"

    # Iterate over mirrors
    for url in "${PMD_URLS[@]}"; do
        if download_file "${url}" "${zip_path}"; then
            print_success "Downloaded to ${zip_path}"
            echo "${zip_path}"
            return 0
        else
            print_warning "Failed to download from ${url}"
        fi
    done

    print_error "All download mirrors failed"
    print_warning "Please download manually and verify network settings."
    exit 1
}

# Extract PMD
extract_pmd() {
    local zip_path="$1"
    print_step "Extracting PMD..."

    if ! unzip -q "${zip_path}" -d "${TOOLS_DIR}"; then
        print_error "Failed to extract PMD"
        exit 1
    fi

    # Clean up zip file
    rm -f "${zip_path}"

    # Make PMD executable
    chmod +x "${PMD_BIN}"

    print_success "Extracted to ${PMD_DIR}"
}

# Verify PMD installation
verify_pmd() {
    print_step "Verifying PMD installation..."

    if "${PMD_BIN}" --version &> /dev/null; then
        local version_info
        version_info=$("${PMD_BIN}" --version 2>&1 | head -n 1)
        print_success "PMD verified: ${version_info}"
        return 0
    else
        print_error "PMD verification failed"
        return 1
    fi
}

# Run PMD analysis
run_pmd_analysis() {
    local target_path="$1"
    local rules_xml="${2:-}"

    print_step "Running PMD analysis on ${target_path}..."

    # Check if target exists
    if [ ! -e "${target_path}" ]; then
        print_error "Target path does not exist: ${target_path}"
        return 1
    fi

    # Use default rules if not provided
    if [ -z "${rules_xml}" ]; then
        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
        rules_xml="${script_dir}/config/critical-rules.xml"
    fi

    # Check if rules exist
    if [ ! -f "${rules_xml}" ]; then
        print_error "Rules file does not exist: ${rules_xml}"
        return 1
    fi

    # Run PMD
    local output_file="pmd-results.json"

    set +e  # Temporarily disable exit on error (PMD returns 4 for violations)
    "${PMD_BIN}" check \
        -d "${target_path}" \
        -R "${rules_xml}" \
        -f json \
        --no-cache \
        > "${output_file}" 2>&1
    local exit_code=$?
    set -e

    # PMD returns 0 for success, 4 for violations found
    if [ ${exit_code} -eq 0 ] || [ ${exit_code} -eq 4 ]; then
        print_success "Analysis complete. Results saved to ${output_file}"

        # Count violations
        if command -v jq &> /dev/null; then
            local violation_count
            violation_count=$(jq '[.files[].violations | length] | add // 0' "${output_file}")
            echo ""
            echo -e "${BOLD}Summary:${NC}"
            echo "  Total violations: ${violation_count}"
        fi

        return 0
    else
        print_error "PMD exited with code ${exit_code}"
        return 1
    fi
}

# Main execution
main() {
    print_header

    # Check dependencies
    check_dependencies

    # Check if PMD is installed
    if ! check_pmd_installed; then
        # Download and install PMD
        zip_path=$(download_pmd)
        extract_pmd "${zip_path}"

        if ! verify_pmd; then
            print_error "PMD installation verification failed"
            exit 1
        fi
    fi

    # Print installation info
    echo ""
    echo -e "${GREEN}────────────────────────────────────────────────────────────${NC}"
    echo -e "${BOLD}Installation Summary:${NC}"
    echo "  PMD Version: ${PMD_VERSION}"
    echo "  Install Path: ${PMD_DIR}"
    echo "  Binary: ${PMD_BIN}"
    echo -e "${GREEN}────────────────────────────────────────────────────────────${NC}"
    echo ""

    # If arguments provided, run analysis
    if [ $# -gt 0 ]; then
        target_path="$1"
        rules_xml="${2:-}"

        run_pmd_analysis "${target_path}" "${rules_xml}"
    else
        print_success "PMD is ready to use!"
        echo ""
        echo "Usage:"
        echo "  $0 <target-path> [rules-xml]"
        echo ""
        echo "Example:"
        echo "  $0 src/main/java"
        echo "  $0 src/main/java config/critical-rules.xml"
    fi
}

# Trap errors
trap 'print_error "Script failed at line $LINENO"' ERR

# Run main
main "$@"
