#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

// --- Configuration ---
const PMD_VERSION = "7.0.0";
const PMD_URLS = [
    `https://github.com/pmd/pmd/releases/download/pmd_releases%2F${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip`,
    `https://sourceforge.net/projects/pmd/files/pmd/${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip/download`,
    `https://repo1.maven.org/maven2/net/sourceforge/pmd/pmd-dist/${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip`
];

const USER_HOME = process.env.HOME || process.env.USERPROFILE;
const TOOLS_DIR = path.join(USER_HOME, ".spring-reviewer", "tools");
const PMD_DIR = path.join(TOOLS_DIR, `pmd-bin-${PMD_VERSION}`);
const PMD_BIN = path.join(PMD_DIR, "bin", process.platform === "win32" ? "pmd.bat" : "pmd");

// --- Helpers ---

function log(msg) { console.error(`\x1b[34m▸ ${msg}\x1b[0m`); }
function success(msg) { console.error(`\x1b[32m✓ ${msg}\x1b[0m`); }
function warn(msg) { console.error(`\x1b[33m⚠ ${msg}\x1b[0m`); }
function error(msg) { console.error(`\x1b[31m✗ ${msg}\x1b[0m`); }

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        log(`Downloading from: ${url}`);
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(true));
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function installPmd() {
    if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true });

    const zipPath = path.join(TOOLS_DIR, `pmd-${PMD_VERSION}.zip`);

    for (const url of PMD_URLS) {
        try {
            await downloadFile(url, zipPath);
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
        } catch (e) {
            warn(`Mirror failed: ${e.message}`);
        }
    }
    return false;
}

function runPmd(targetPath, rulesPath) {
    log(`Analyzing: ${targetPath}`);
    
    return new Promise((resolve, reject) => {
        const pmdProc = spawn(PMD_BIN, [
            "check",
            "-d", targetPath,
            "-R", rulesPath,
            "-f", "json",
            "--no-cache"
        ]);

        let stdout = "";
        let stderr = "";

        pmdProc.stdout.on("data", d => stdout += d);
        pmdProc.stderr.on("data", d => stderr += d);

        pmdProc.on("close", (code) => {
            // PMD returns 4 for violations
            if (code !== 0 && code !== 4) {
               error(`PMD Failed (Code ${code}): ${stderr}`);
               return resolve(null);
            }
            
            try {
                const json = JSON.parse(stdout);
                success(`Analysis complete. Found ${json.files ? json.files.length : 0} files with issues.`);
                resolve(json);
            } catch (e) {
                warn("Failed to parse JSON output. Returning raw text.");
                resolve({ raw: stdout });
            }
        });
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
        error("Usage: node pmd-bootstrap.js <target_path>");
        process.exit(1);
    }
    
    // 3. Resolve Rules
    // Assume scripts/pmd-bootstrap.js -> parent -> config -> critical-rules.xml
    const scriptDir = __dirname; 
    const rulesPath = path.join(scriptDir, "..", "config", "critical-rules.xml");

    if (!fs.existsSync(rulesPath)) {
        error(`Rules file not found: ${rulesPath}`);
        // Fallback or exit?
        process.exit(1);
    }

    // 4. Run
    const result = await runPmd(targetPath, rulesPath);
    if (result) {
        const simplified = simplifyResults(result);
        console.log(JSON.stringify(simplified, null, 2));
    }
})();
