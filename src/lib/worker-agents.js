/**
 * Worker Agent - CLI Tool Runner
 * Workers run mature CLI tools and parse their output
 */

import fs from "fs";
import path from "path";
import { CliTool, ResultParser, TOOLS } from "./cli-tool.js";
import { log, success, warn, error } from "./logger.js";

/**
 * Base Worker Agent
 */
class WorkerAgent {
  constructor(options = {}) {
    this.type = options.type || "analyzer";
    this.name = options.name || `${this.type}-worker`;
    this.projectPath = options.projectPath;
  }

  async analyze(chunk) {
    throw new Error("analyze() must be implemented by subclass");
  }

  /**
   * Install a tool if not already installed
   */
  async ensureTool(toolKey) {
    const tool = new CliTool(toolKey);
    if (!tool.isInstalled()) {
      log(`Installing ${tool.name}...`);
      const installed = await tool.install();
      if (!installed) {
        throw new Error(`Failed to install ${tool.name}`);
      }
      success(`${tool.name} installed`);
    }
    return tool;
  }
}

/**
 * PMD Analysis Worker
 * Runs PMD static analysis
 */
class PMDWorker extends WorkerAgent {
  constructor(options) {
    super({ ...options, type: "pmd" });
  }

  async analyze(chunk) {
    const results = {
      chunkId: chunk.id,
      files: chunk.files,
      issues: [],
      metrics: {}
    };

    try {
      const tool = await this.ensureTool("PMD");

      // Get rules file
      const rulesPath = path.join(process.cwd(), "src", "skills", "analyzers", "spring-reviewer", "config", "critical-rules.xml");
      if (!fs.existsSync(rulesPath)) {
        throw new Error(`PMD rules file not found: ${rulesPath}`);
      }

      // Run PMD on the project (PMD handles all files)
      const { stdout, exitCode } = await tool.run([
        "check",
        "-d", this.projectPath,
        "-R", rulesPath,
        "-f", "json",
        "--no-cache"
      ]);

      // Parse results
      const allIssues = ResultParser.parsePMD(stdout);

      // Filter to only include files in this chunk
      const chunkFileSet = new Set(chunk.files);
      results.issues = allIssues.filter(issue => chunkFileSet.has(issue.file));

      // Metrics
      results.metrics = {
        fileCount: chunk.files.length,
        totalLines: this.countLines(chunk),
        issueCount: results.issues.length,
        toolVersion: TOOLS.PMD.version
      };

    } catch (e) {
      error(`PMD analysis error: ${e.message}`);
      results.error = e.message;
    }

    return results;
  }

  countLines(chunk) {
    let total = 0;
    for (const file of chunk.files) {
      try {
        total += fs.readFileSync(file, "utf-8").split("\n").length;
      } catch (e) {
        // Skip unreadable files
      }
    }
    return total;
  }
}

/**
 * SpotBugs Worker
 * Runs SpotBugs bug detection
 */
class SpotBugsWorker extends WorkerAgent {
  constructor(options) {
    super({ ...options, type: "spotbugs" });
  }

  async analyze(chunk) {
    const results = {
      chunkId: chunk.id,
      files: chunk.files,
      issues: [],
      metrics: {}
    };

    try {
      const tool = await this.ensureTool("SPOTBUGS");

      // SpotBugs needs compiled classes
      // For now, run on the project and filter results
      const { stdout, exitCode } = await tool.run([
        "-textui",
        "-low",
        this.projectPath
      ]);

      // Parse results (will implement XML parsing)
      results.issues = ResultParser.parseSpotBugs(stdout);
      results.metrics = {
        toolVersion: TOOLS.SPOTBUGS.version
      };

    } catch (e) {
      error(`SpotBugs analysis error: ${e.message}`);
      results.error = e.message;
    }

    return results;
  }
}

/**
 * Checkstyle Worker
 * Runs Checkstyle for code style checking
 */
class CheckstyleWorker extends WorkerAgent {
  constructor(options) {
    super({ ...options, type: "checkstyle" });
  }

  async analyze(chunk) {
    const results = {
      chunkId: chunk.id,
      files: chunk.files,
      issues: [],
      metrics: {}
    };

    try {
      const tool = await this.ensureTool("CHECKSTYLE");

      // Get config file
      const configPath = path.join(process.cwd(), "src", "skills", "analyzers", "checkstyle", "config", "checkstyle.xml");
      const defaultConfig = "/google_checks.xml"; // Use built-in Google style

      const configFile = fs.existsSync(configPath) ? configPath : defaultConfig;

      // Run on each file in chunk
      const allIssues = [];
      for (const file of chunk.files) {
        try {
          const { stdout } = await tool.run([
            "-c", configFile,
            "-f", "xml",
            file
          ]);
          const fileIssues = ResultParser.parseCheckstyle(stdout);
          allIssues.push(...fileIssues);
        } catch (e) {
          // Skip files that can't be analyzed
        }
      }

      results.issues = allIssues;
      results.metrics = {
        fileCount: chunk.files.length,
        issueCount: allIssues.length,
        toolVersion: TOOLS.CHECKSTYLE.version
      };

    } catch (e) {
      error(`Checkstyle analysis error: ${e.message}`);
      results.error = e.message;
    }

    return results;
  }
}

/**
 * Multi-Tool Worker
 * Runs multiple tools in parallel
 */
class MultiToolWorker extends WorkerAgent {
  constructor(options) {
    super({ ...options, type: "multi" });
    this.tools = options.tools || ["pmd"];
  }

  async analyze(chunk) {
    const results = {
      chunkId: chunk.id,
      files: chunk.files,
      issues: [],
      metrics: {},
      toolResults: {}
    };

    // Run each tool
    for (const toolKey of this.tools) {
      let worker;
      switch (toolKey.toLowerCase()) {
        case "pmd":
          worker = new PMDWorker({ projectPath: this.projectPath });
          break;
        case "spotbugs":
          worker = new SpotBugsWorker({ projectPath: this.projectPath });
          break;
        case "checkstyle":
          worker = new CheckstyleWorker({ projectPath: this.projectPath });
          break;
        default:
          warn(`Unknown tool: ${toolKey}`);
          continue;
      }

      if (worker) {
        const toolResult = await worker.analyze(chunk);
        results.toolResults[toolKey] = toolResult;
        results.issues.push(...toolResult.issues);
      }
    }

    // Aggregate metrics
    results.metrics = {
      totalIssues: results.issues.length,
      toolsRun: Object.keys(results.toolResults)
    };

    return results;
  }
}

/**
 * Worker Factory
 */
export function createWorker(type, options) {
  switch (type.toLowerCase()) {
    case "pmd":
      return new PMDWorker(options);
    case "spotbugs":
      return new SpotBugsWorker(options);
    case "checkstyle":
      return new CheckstyleWorker(options);
    case "analyzer":
    case "multi":
      return new MultiToolWorker({ ...options, tools: ["pmd"] });
    case "architect":
      return new MultiToolWorker({ ...options, tools: ["pmd"] });
    default:
      return new WorkerAgent(options);
  }
}

export {
  WorkerAgent,
  PMDWorker,
  SpotBugsWorker,
  CheckstyleWorker,
  MultiToolWorker
};
