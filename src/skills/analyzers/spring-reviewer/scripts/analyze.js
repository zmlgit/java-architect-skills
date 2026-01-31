#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import AdmZip from "adm-zip";
import { fileURLToPath } from "url";

// Import shared utilities from lib/
import { log, success, warn, error } from "../../../../lib/logger.js";
import { downloadWithFallback } from "../../../../lib/downloader.js";
import { runCommand } from "../../../../lib/process.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const PMD_VERSION = "7.0.0";
const PMD_URLS = [
  `https://github.com/pmd/pmd/releases/download/pmd_releases%2F${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip`,
  `https://sourceforge.net/projects/pmd/files/pmd/${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip/download`,
  `https://repo1.maven.org/maven2/net/sourceforge/pmd/pmd-dist/${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip`
];

// Get paths function - avoids process access at module level
function getPaths() {
  const USER_HOME = process.env.HOME || process.env.USERPROFILE;
  const TOOLS_DIR = path.join(USER_HOME, ".spring-reviewer", "tools");
  const PMD_DIR = path.join(TOOLS_DIR, `pmd-bin-${PMD_VERSION}`);
  const PMD_BIN = path.join(PMD_DIR, "bin", process.platform === "win32" ? "pmd.bat" : "pmd");
  return { USER_HOME, TOOLS_DIR, PMD_DIR, PMD_BIN };
}

async function installPmd() {
  const { TOOLS_DIR, PMD_DIR, PMD_BIN } = getPaths();
  if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true });

  const zipPath = path.join(TOOLS_DIR, `pmd-${PMD_VERSION}.zip`);

  const downloaded = await downloadWithFallback(PMD_URLS, zipPath, (url) => {
    log(`Downloading from: ${url}`);
  });

  if (!downloaded) {
    return false;
  }

  success(`Downloaded to ${zipPath}`);

  // Extract
  log("Extracting...");
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(TOOLS_DIR, true);

  // Cleanup
  fs.unlinkSync(zipPath);

  // Chmod
  if (process.platform !== "win32") {
    fs.chmodSync(PMD_BIN, 0o755);
  }

  success(`Extracted to ${PMD_DIR}`);
  return true;
}

function runPmd(targetPath, rulesPath) {
  const { PMD_BIN } = getPaths();
  log(`Analyzing: ${targetPath}`);

  return runCommand(PMD_BIN, [
    "check",
    "-d", targetPath,
    "-R", rulesPath,
    "-f", "json",
    "--no-cache"
  ]).then(({ stdout, stderr, code }) => {
    // PMD returns 4 for violations
    if (code !== 0 && code !== 4) {
      error(`PMD Failed (Code ${code}): ${stderr}`);
      return null;
    }

    try {
      const json = JSON.parse(stdout);
      success(`Analysis complete. Found ${json.files ? json.files.length : 0} files with issues.`);
      return json;
    } catch (e) {
      warn("Failed to parse JSON output. Returning raw text.");
      return { raw: stdout };
    }
  });
}

function simplifyResults(pmdData) {
  if (!pmdData || !pmdData.files) return [];

  const results = [];
  for (const file of pmdData.files) {
    for (const v of file.violations) {
      results.push({
        file: file.filename,
        line: v.beginline,
        rule: v.rule,
        description: v.description,
        priority: v.priority
      });
    }
  }
  return results;
}

// --- Main ---

(async () => {
  const { PMD_BIN } = getPaths();

  // 1. Check Install
  if (!fs.existsSync(PMD_BIN)) {
    const installed = await installPmd();
    if (!installed) {
      error("Failed to install PMD from any mirror.");
      process.exit(1);
    }
  }

  // 2. Parse Args
  const targetPath = process.argv[2];
  if (!targetPath) {
    error("Usage: node analyze.js <target_path>");
    process.exit(1);
  }

  // 3. Resolve Rules
  // Assume scripts/analyze.js -> parent -> config -> critical-rules.xml
  const rulesPath = path.join(__dirname, "..", "config", "critical-rules.xml");

  if (!fs.existsSync(rulesPath)) {
    error(`Rules file not found: ${rulesPath}`);
    process.exit(1);
  }

  // 4. Run
  const result = await runPmd(targetPath, rulesPath);
  if (result) {
    const simplified = simplifyResults(result);
    console.log(JSON.stringify(simplified, null, 2));
  }
})();
