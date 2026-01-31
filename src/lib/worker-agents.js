/**
 * Worker Agent Interface and Implementations
 * Workers handle specific analysis tasks under Master Agent direction
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Base Worker Agent
 */
class WorkerAgent {
  constructor(options = {}) {
    this.type = options.type || "analyzer";
    this.name = options.name || `${this.type}-worker`;
    this skillsPath = options.skillsPath || path.join(process.cwd(), "src", "skills");
  }

  /**
   * Analyze a chunk of files
   */
  async analyze(chunk) {
    throw new Error("analyze() must be implemented by subclass");
  }

  /**
   * Run a script with file list
   */
  async runScript(scriptPath, args, options = {}) {
    return new Promise((resolve, reject) => {
      const process = spawn("node", [scriptPath, ...args], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "production" },
        ...options
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Script failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Parse JSON output from script
   */
  parseScriptOutput(output) {
    try {
      // Find JSON in output (might be embedded in other text)
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(output);
    } catch (e) {
      return { raw: output };
    }
  }
}

/**
 * Code Analysis Worker
 * Performs PMD and refactoring analysis
 */
class CodeAnalysisWorker extends WorkerAgent {
  constructor(options) {
    super({ ...options, type: "analyzer" });
  }

  async analyze(chunk) {
    const results = {
      chunkId: chunk.id,
      files: chunk.files,
      issues: [],
      metrics: {}
    };

    // Run PMD analysis if available
    try {
      const pmdScript = path.join(this.skillsPath, "analyzers", "spring-reviewer", "scripts", "analyze.js");
      if (fs.existsSync(pmdScript)) {
        const { stdout } = await this.runScript(pmdScript, [chunk.files[0]]); // Analyze first file as sample
        const pmdResults = this.parseScriptOutput(stdout);
        results.pmd = pmdResults;
        results.issues.push(...(pmdResults.files || []));
      }
    } catch (e) {
      // PMD not available, continue without it
    }

    // Run refactoring analysis
    try {
      const refactorScript = path.join(this.skillsPath, "refactors", "spring-refactor", "scripts", "analyze.js");
      if (fs.existsSync(refactorScript)) {
        const { stdout } = await this.runScript(refactorScript, [chunk.files[0]]);
        const refactorResults = this.parseScriptOutput(stdout);
        results.refactor = refactorResults.opportunities || [];
        results.issues.push(...(results.refactor || []));
      }
    } catch (e) {
      // Refactor not available
    }

    // Basic file statistics
    results.metrics = {
      fileCount: chunk.files.length,
      totalLines: this.countLines(chunk),
      avgLinesPerFile: 0
    };

    if (chunk.files.length > 0) {
      results.metrics.avgLinesPerFile = Math.round(results.metrics.totalLines / chunk.files.length);
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
 * Architecture Review Worker
 * Performs SOLID and layer analysis
 */
class ArchitectureWorker extends WorkerAgent {
  constructor(options) {
    super({ ...options, type: "architect" });
  }

  async analyze(chunk) {
    const results = {
      chunkId: chunk.id,
      files: chunk.files,
      solidScores: {},
      layers: {},
      patterns: []
    };

    // Run architecture review
    try {
      const archScript = path.join(this.skillsPath, "architects", "java-architect", "scripts", "review.js");
      if (fs.existsSync(archScript)) {
        const { stdout } = await this.runScript(archScript, [chunk.files[0]]);
        const archResults = this.parseScriptOutput(stdout);
        results.solidScores = archResults.solidScores || {};
        results.layers = archResults.layers || {};
        results.patterns = archResults.designPatterns || [];
      }
    } catch (e) {
      // Architecture review not available
    }

    return results;
  }
}

/**
 * Verification Worker
 * Cross-validates results to reduce hallucinations
 */
class VerificationWorker extends WorkerAgent {
  constructor(options) {
    super({ ...options, type: "verifier" });
  }

  /**
   * Verify analysis results
   */
  async verify(results) {
    const verification = {
      checked: 0,
      passed: 0,
      failed: 0,
      issues: []
    };

    // Cross-check for inconsistencies
    for (const result of results) {
      verification.checked++;

      // Verify file references exist
      if (result.issues) {
        for (const issue of result.issues) {
          if (issue.file) {
            if (fs.existsSync(issue.file)) {
              verification.passed++;
            } else {
              verification.failed++;
              verification.issues.push({
                type: "file_not_found",
                file: issue.file
              });
            }
          }
        }
      }
    }

    return verification;
  }

  /**
   * Detect potential hallucinations
   */
  detectHallucinations(results) {
    const hallucinations = [];

    // Check for impossible metrics
    for (const result of results) {
      if (result.metrics) {
        if (result.metrics.avgLinesPerFile < 0) {
          hallucinations.push({
            type: "negative_avg_lines",
            chunk: result.chunkId
          });
        }
        if (result.metrics.totalLines > 1000000) { // Suspiciously large
          hallucinations.push({
            type: "unrealistic_line_count",
            chunk: result.chunkId,
            value: result.metrics.totalLines
          });
        }
      }
    }

    return hallucinations;
  }
}

/**
 * Worker Factory
 */
export function createWorker(type, options) {
  switch (type) {
    case "analyzer":
      return new CodeAnalysisWorker(options);
    case "architect":
      return new ArchitectureWorker(options);
    case "verifier":
      return new VerificationWorker(options);
    default:
      return new WorkerAgent(options);
  }
}

export {
  WorkerAgent,
  CodeAnalysisWorker,
  ArchitectureWorker,
  VerificationWorker
};
