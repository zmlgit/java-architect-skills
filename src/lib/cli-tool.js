/**
 * CLI Tool Integration Framework
 * Glue layer for running mature Java analysis tools
 */

import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { log, success, warn, error } from "./logger.js";
import { downloadWithFallback } from "./downloader.js";
import AdmZip from "adm-zip";

/**
 * Tool definitions with download URLs and requirements
 */
export const TOOLS = {
  PMD: {
    name: "PMD",
    version: "7.0.0",
    urls: [
      `https://github.com/pmd/pmd/releases/download/pmd_releases%2F7.0.0/pmd-dist-7.0.0-bin.zip`,
      `https://sourceforge.net/projects/pmd/files/pmd/7.0.0/pmd-dist-7.0.0-bin.zip/download`
    ],
    binary: "pmd",
    mainClass: "net.sourceforge.pmd.PMD",
    description: "Static code analysis for Java"
  },
  SPOTBUGS: {
    name: "SpotBugs",
    version: "4.8.6",
    urls: [
      `https://github.com/spotbugs/spotbugs/releases/download/4.8.6/spotbugs-4.8.6.tgz`,
      `https://repo1.maven.org/maven2/com/github/spotbugs/spotbugs/4.8.6/spotbugs-4.8.6.tgz`
    ],
    binary: "spotbugs",
    mainClass: "edu.umd.cs.findbugs.LaunchAppropriateUI",
    description: "Bug detection for Java"
  },
  CHECKSTYLE: {
    name: "Checkstyle",
    version: "10.18.2",
    urls: [
      `https://github.com/checkstyle/checkstyle/releases/checkstyle-10.18.2/checkstyle-10.18.2-all.jar`
    ],
    binary: "checkstyle",
    jar: "checkstyle-10.18.2-all.jar",
    description: "Code style checking"
  },
  JDEPEND: {
    name: "JDepend",
    version: "2.9.1",
    urls: [
      `https://github.com/clarkware/jdepend/releases/download/v2.9.1/jdepend-2.9.1.jar`
    ],
    binary: "jdepend",
    jar: "jdepend-2.9.1.jar",
    description: "Dependency analysis"
  }
};

/**
 * CLI Tool Runner
 */
export class CliTool {
  constructor(toolKey, options = {}) {
    const tool = TOOLS[toolKey];
    if (!tool) {
      throw new Error(`Unknown tool: ${toolKey}`);
    }

    this.toolKey = toolKey;
    this.name = tool.name;
    this.version = tool.version;
    this.urls = tool.urls;
    this.binary = tool.binary;
    this.mainClass = tool.mainClass;
    this.jar = tool.jar;
    this.options = options;

    const USER_HOME = process.env.HOME || process.env.USERPROFILE;
    this.toolsDir = path.join(USER_HOME, ".java-analysis-tools");
    this.toolDir = path.join(this.toolsDir, `${this.name.toLowerCase()}-${this.version}`);
  }

  /**
   * Get the executable path for this tool
   */
  getExecutablePath() {
    if (this.jar) {
      // JAR-based tool
      return path.join(this.toolDir, this.jar);
    }

    // Binary-based tool
    const binDir = path.join(this.toolDir, "bin");
    if (process.platform === "win32") {
      return path.join(binDir, `${this.binary}.bat`);
    }
    return path.join(binDir, this.binary);
  }

  /**
   * Check if tool is installed
   */
  isInstalled() {
    const execPath = this.getExecutablePath();
    return fs.existsSync(execPath);
  }

  /**
   * Install the tool
   */
  async install() {
    if (this.isInstalled()) {
      log(`${this.name} already installed at ${this.toolDir}`);
      return true;
    }

    log(`Installing ${this.name} ${this.version}...`);

    // Create tools directory
    if (!fs.existsSync(this.toolsDir)) {
      fs.mkdirSync(this.toolsDir, { recursive: true });
    }

    // Download
    let downloaded = false;
    let downloadPath = null;
    for (const url of this.urls) {
      const ext = url.endsWith(".zip") ? ".zip" : (url.endsWith(".jar") ? ".jar" : ".tgz");
      downloadPath = path.join(this.toolsDir, `${this.name}-${this.version}${ext}`);

      try {
        log(`Downloading from: ${url}`);
        downloaded = await downloadWithFallback([url], downloadPath);
        if (downloaded) {
          break;
        }
      } catch (e) {
        warn(`Failed to download from ${url}: ${e.message}`);
      }
    }

    if (!downloaded || !downloadPath) {
      error(`Failed to download ${this.name} from all sources`);
      return false;
    }

    // Extract archive
    try {
      if (downloadPath.endsWith(".zip")) {
        log(`Extracting ${downloadPath}...`);
        const zip = new AdmZip(downloadPath);
        zip.extractAllTo(this.toolsDir, true);
        fs.unlinkSync(downloadPath);

        // PMD extracts to pmd-bin-{version} directory, rename if needed
        const extractedDir = path.join(this.toolsDir, `pmd-bin-${this.version}`);
        if (fs.existsSync(extractedDir) && !fs.existsSync(this.toolDir)) {
          fs.renameSync(extractedDir, this.toolDir);
        }
      } else if (downloadPath.endsWith(".tgz") || downloadPath.endsWith(".tar.gz")) {
        log(`Extracting ${downloadPath}...`);
        execSync(`tar -xzf "${downloadPath}" -C "${this.toolsDir}"`);
        fs.unlinkSync(downloadPath);

        // Handle SpotBugs directory naming
        const extractedDir = path.join(this.toolsDir, `spotbugs-${this.version}`);
        if (fs.existsSync(extractedDir) && !fs.existsSync(this.toolDir)) {
          fs.renameSync(extractedDir, this.toolDir);
        }
      } else if (downloadPath.endsWith(".jar")) {
        // JAR file - just move it
        fs.mkdirSync(this.toolDir, { recursive: true });
        fs.renameSync(downloadPath, path.join(this.toolDir, this.jar));
      }

      // Make binary executable on Unix
      if (!this.jar && process.platform !== "win32") {
        const binPath = this.getExecutablePath();
        if (fs.existsSync(binPath)) {
          fs.chmodSync(binPath, 0o755);
        }
      }

      success(`${this.name} installed successfully`);
      return true;
    } catch (e) {
      error(`Failed to extract ${this.name}: ${e.message}`);
      return false;
    }
  }

  /**
   * Run the tool with arguments
   */
  async run(args, options = {}) {
    const execPath = this.getExecutablePath();

    if (!fs.existsSync(execPath)) {
      throw new Error(`${this.name} not installed. Run install() first.`);
    }

    const { timeout = 300000 } = options;

    return new Promise((resolve, reject) => {
      let cmd, cmdArgs;

      if (this.jar || execPath.endsWith(".jar")) {
        // JAR-based tool
        cmd = "java";
        cmdArgs = ["-jar", execPath, ...args];
      } else {
        // Binary tool
        cmd = execPath;
        cmdArgs = args;
      }

      log(`Running: ${this.name} ${args.join(" ")}`);

      const child = spawn(cmd, cmdArgs, {
        cwd: process.cwd(),
        env: process.env
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`${this.name} timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

/**
 * Result Parser for different tool outputs
 */
export class ResultParser {
  /**
   * Parse PMD JSON output
   */
  static parsePMD(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const results = [];

      if (data.files) {
        for (const file of data.files) {
          for (const violation of file.violations || []) {
            results.push({
              tool: "PMD",
              file: file.filename,
              line: violation.beginline,
              rule: violation.rule,
              description: violation.description,
              priority: violation.priority,
              severity: violation.priority <= 2 ? "critical" : violation.priority <= 3 ? "warning" : "info"
            });
          }
        }
      }

      return results;
    } catch (e) {
      throw new Error(`Failed to parse PMD output: ${e.message}`);
    }
  }

  /**
   * Parse SpotBugs XML output
   */
  static parseSpotBugs(xmlString) {
    // For now, return raw - will implement proper XML parsing
    return {
      tool: "SpotBugs",
      raw: xmlString
    };
  }

  /**
   * Parse Checkstyle XML output
   */
  static parseCheckstyle(xmlString) {
    // For now, return raw - will implement proper XML parsing
    return {
      tool: "Checkstyle",
      raw: xmlString
    };
  }

  /**
   * Parse JDepend XML output
   */
  static parseJDepend(xmlString) {
    // For now, return raw - will implement proper XML parsing
    return {
      tool: "JDepend",
      raw: xmlString
    };
  }
}

/**
 * Find Java files in a directory
 */
export function findJavaFiles(targetPath) {
  const files = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip common ignore directories
        if (!["node_modules", ".git", "target", "build", ".idea", "dist", "out"].includes(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(".java")) {
        files.push(fullPath);
      }
    }
  }

  scanDir(targetPath);
  return files;
}
