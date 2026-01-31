#!/usr/bin/env node

/**
 * Spring Refactor Analysis
 * Note: This now uses CLI tools (Checkstyle) instead of custom parsing
 * Full refactoring analysis will be integrated with multi-tool worker
 */

import { log, success, warn, error } from "../../../../lib/logger.js";
import { findJavaFiles } from "../../../../lib/cli-tool.js";
import { CliTool, ResultParser } from "../../../../lib/cli-tool.js";

async function analyze(targetPath) {
  log(`Analyzing Spring code for refactoring opportunities...`);
  log(`Target: ${targetPath}\n`);

  // Use PMD for code smell detection
  try {
    const tool = new CliTool("PMD");

    if (!tool.isInstalled()) {
      warn("PMD not installed. Run PMD analysis first.");
      return {
        title: "Spring Refactoring Analysis",
        targetPath,
        opportunities: [],
        summary: { high: 0, medium: 0, low: 0, total: 0 }
      };
    }

    // PMD already detects code smells like:
    // - Long methods
    // - God classes
    // - Complex methods
    // - Unused code
    // etc.

    success("Refactoring analysis is now part of PMD analysis");
    success("Run: spring-reviewer-analyze for comprehensive analysis");

    return {
      title: "Spring Refactoring Analysis",
      targetPath,
      opportunities: [],
      summary: { high: 0, medium: 0, low: 0, total: 0 },
      note: "Code smells are now detected by PMD analysis"
    };

  } catch (e) {
    error(`Analysis failed: ${e.message}`);
    throw e;
  }
}

// Main
(async () => {
  const targetPath = process.argv[2];
  if (!targetPath) {
    error("Usage: node analyze.js <target_path>");
    process.exit(1);
  }

  const result = await analyze(targetPath);
  console.log(JSON.stringify(result, null, 2));
})();
