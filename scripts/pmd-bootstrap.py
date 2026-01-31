#!/usr/bin/env python3
"""
PMD Bootstrap Script
Automatically downloads and configures PMD for Spring Reviewer.
"""

import os
import sys
import json
import urllib.request
import zipfile
import shutil
import subprocess
from pathlib import Path

# Configuration
PMD_VERSION = "7.0.0"
PMD_URLS = [
    # Primary: GitHub Releases
    f"https://github.com/pmd/pmd/releases/download/pmd_releases%2F{PMD_VERSION}/pmd-dist-{PMD_VERSION}-bin.zip",
    # Backup 1: SourceForge (Reliable Mirror)
    f"https://sourceforge.net/projects/pmd/files/pmd/{PMD_VERSION}/pmd-dist-{PMD_VERSION}-bin.zip/download",
    # Backup 2: Maven Central (Reliable Mirror)
    f"https://repo1.maven.org/maven2/net/sourceforge/pmd/pmd-dist/{PMD_VERSION}/pmd-dist-{PMD_VERSION}-bin.zip"
]
TOOLS_DIR = Path.home() / ".spring-reviewer" / "tools"
PMD_DIR = TOOLS_DIR / f"pmd-bin-{PMD_VERSION}"
PMD_BIN = PMD_DIR / "bin" / "pmd"


class Colors:
    """ANSI color codes for terminal output."""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_step(message):
    """Print a step message with formatting."""
    print(f"{Colors.OKBLUE}▸ {message}{Colors.ENDC}")


def print_success(message):
    """Print a success message with formatting."""
    print(f"{Colors.OKGREEN}✓ {message}{Colors.ENDC}")


def print_error(message):
    """Print an error message with formatting."""
    print(f"{Colors.FAIL}✗ {message}{Colors.ENDC}", file=sys.stderr)


def print_warning(message):
    """Print a warning message with formatting."""
    print(f"{Colors.WARNING}⚠ {message}{Colors.ENDC}")


def check_pmd_installed():
    """Check if PMD is already installed."""
    if PMD_BIN.exists():
        print_success(f"PMD {PMD_VERSION} already installed at {PMD_DIR}")
        return True
    return False


def download_file(url, target_path):
    """Download file from URL with progress bar."""
    try:
        def report_progress(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = min(100, (downloaded / total_size) * 100)
                bar_length = 40
                filled = int(bar_length * percent / 100)
                bar = '█' * filled + '░' * (bar_length - filled)
                print(f'\r  Progress: [{bar}] {percent:.1f}%', end='', flush=True)
            else:
                print(f'\r  Downloaded: {downloaded / 1024 / 1024:.1f} MB', end='', flush=True)

        print_step(f"Attempting download from: {url}")
        opener = urllib.request.build_opener()
        opener.addheaders = [('User-agent', 'Mozilla/5.0')]
        urllib.request.install_opener(opener)
        urllib.request.urlretrieve(url, target_path, reporthook=report_progress)
        print()  # New line after progress bar
        return True
    except Exception as e:
        print()
        print_warning(f"Download failed from {url}: {e}")
        return False


def download_pmd():
    """Download PMD from available mirrors."""
    print_step(f"Looking for PMD {PMD_VERSION}...")

    TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = TOOLS_DIR / f"pmd-{PMD_VERSION}.zip"

    # Try each mirror
    for url in PMD_URLS:
        if download_file(url, zip_path):
            print_success(f"Successfully downloaded to {zip_path}")
            return zip_path
    
    # If all fail
    print_error("All download mirrors failed.")
    print_warning(f"Please manually download PMD {PMD_VERSION} bin.zip and place it at: {zip_path}")
    sys.exit(1)


def extract_pmd(zip_path):
    """Extract PMD zip file."""
    print_step("Extracting PMD...")

    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(TOOLS_DIR)

        # Clean up zip file
        zip_path.unlink()
        print_success(f"Extracted to {PMD_DIR}")

        # Make PMD executable
        pmd_bin = PMD_DIR / "bin" / "pmd"
        if pmd_bin.exists():
            os.chmod(pmd_bin, 0o755)
            print_success("Made PMD executable")

    except Exception as e:
        print_error(f"Failed to extract PMD: {e}")
        sys.exit(1)


def verify_pmd():
    """Verify PMD installation."""
    print_step("Verifying PMD installation...")

    try:
        if sys.platform == "win32":
            pmd_cmd = str(PMD_DIR / "bin" / "pmd.bat")
        else:
            pmd_cmd = str(PMD_BIN)

        result = subprocess.run(
            [pmd_cmd, "--version"],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode == 0:
            version_info = result.stdout.strip()
            print_success(f"PMD verified: {version_info}")
            return True
        else:
            print_error("PMD verification failed")
            return False

    except Exception as e:
        print_error(f"Failed to verify PMD: {e}")
        return False


def run_pmd_analysis(target_path, rules_xml, output_format="json"):
    """
    Run PMD analysis on target path.

    Args:
        target_path: Path to analyze (file or directory)
        rules_xml: Path to PMD rules XML file
        output_format: Output format (json, text, xml, html)

    Returns:
        dict: Parsed results or None on failure
    """
    print_step(f"Running PMD analysis on {target_path}...")

    target = Path(target_path)
    if not target.exists():
        print_error(f"Target path does not exist: {target_path}")
        return None

    rules = Path(rules_xml)
    if not rules.exists():
        print_error(f"Rules file does not exist: {rules_xml}")
        return None

    if sys.platform == "win32":
        pmd_cmd = str(PMD_DIR / "bin" / "pmd.bat")
    else:
        pmd_cmd = str(PMD_BIN)

    try:
        cmd = [
            pmd_cmd,
            "check",
            "-d", str(target),
            "-R", str(rules),
            "-f", output_format,
            "--no-cache"
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )

        # PMD returns exit code 4 when violations are found
        if result.returncode in [0, 4]:
            if output_format == "json":
                try:
                    data = json.loads(result.stdout)
                    print_success(f"Analysis complete. Found {len(data.get('files', []))} files with issues.")
                    return data
                except json.JSONDecodeError:
                    print_warning("Could not parse JSON output, returning raw text")
                    return {"raw": result.stdout}
            else:
                print_success("Analysis complete.")
                return {"raw": result.stdout}
        else:
            print_error(f"PMD exited with code {result.returncode}")
            if result.stderr:
                print_error(f"Error output: {result.stderr}")
            return None

    except subprocess.TimeoutExpired:
        print_error("PMD analysis timed out (5 minutes)")
        return None
    except Exception as e:
        print_error(f"Failed to run PMD: {e}")
        return None


def format_pmd_results(pmd_data):
    """
    Format PMD results into simplified structure.

    Args:
        pmd_data: Raw PMD JSON output

    Returns:
        list: Simplified results with {file, line, rule, description}
    """
    if not pmd_data or "files" not in pmd_data:
        return []

    simplified = []

    for file_entry in pmd_data.get("files", []):
        filename = file_entry.get("filename", "unknown")

        for violation in file_entry.get("violations", []):
            simplified.append({
                "file": filename,
                "line": violation.get("beginline", 0),
                "endLine": violation.get("endline", 0),
                "rule": violation.get("rule", "unknown"),
                "ruleSet": violation.get("ruleset", "unknown"),
                "priority": violation.get("priority", 3),
                "description": violation.get("description", ""),
                "externalInfoUrl": violation.get("externalInfoUrl", "")
            })

    return simplified


def main():
    """Main execution flow."""
    print(f"{Colors.HEADER}{Colors.BOLD}")
    print("═" * 60)
    print("  Spring Reviewer - PMD Bootstrap")
    print("═" * 60)
    print(f"{Colors.ENDC}")

    # Check if PMD is installed
    if not check_pmd_installed():
        # Download and install PMD
        zip_path = download_pmd()
        extract_pmd(zip_path)

        if not verify_pmd():
            print_error("PMD installation verification failed")
            sys.exit(1)

    # Print installation info
    print()
    print(f"{Colors.OKGREEN}{'─' * 60}{Colors.ENDC}")
    print(f"{Colors.BOLD}Installation Summary:{Colors.ENDC}")
    print(f"  PMD Version: {PMD_VERSION}")
    print(f"  Install Path: {PMD_DIR}")
    print(f"  Binary: {PMD_BIN}")
    print(f"{Colors.OKGREEN}{'─' * 60}{Colors.ENDC}")
    print()

    # If arguments provided, run analysis
    if len(sys.argv) > 1:
        target_path = sys.argv[1]

        # Determine rules file
        if len(sys.argv) > 2:
            rules_xml = sys.argv[2]
        else:
            # Use default critical-rules.xml
            script_dir = Path(__file__).parent.parent
            rules_xml = script_dir / "config" / "critical-rules.xml"

        # Run analysis
        results = run_pmd_analysis(target_path, rules_xml)

        if results:
            simplified = format_pmd_results(results)

            # Output results as JSON
            print()
            print(f"{Colors.BOLD}Results:{Colors.ENDC}")
            print(json.dumps(simplified, indent=2))

            # Save to file
            output_file = Path("pmd-results.json")
            with open(output_file, "w") as f:
                json.dump(simplified, f, indent=2)
            print()
            print_success(f"Results saved to {output_file}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        print_warning("Operation cancelled by user")
        sys.exit(130)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        sys.exit(1)
