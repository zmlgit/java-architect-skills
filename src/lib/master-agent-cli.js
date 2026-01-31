#!/usr/bin/env node

/**
 * Master Agent CLI
 * Command-line interface for distributed Java project analysis
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { log, success, warn, error, debug } from "../../../lib/logger.js";
import { createMasterAgent, AnalysisState } from "../../../lib/master-agent.js";
import { createWorker } from "../../../lib/worker-agents.js";

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse command
  const command = args[0] || "analyze";
  const targetPath = args[1];

  if (!targetPath) {
    printUsage();
    process.exit(1);
  }

  // Validate target
  if (!fs.existsSync(targetPath)) {
    error(`Target path does not exist: ${targetPath}`);
    process.exit(1);
  }

  // Checkpoint directory
  const checkpointDir = path.join(process.cwd(), ".java-archient-checkpoints");
  if (!fs.existsSync(checkpointDir)) {
    fs.mkdirSync(checkpointDir, { recursive: true });
  }

  // Create workers
  const skillsPath = path.join(__dirname, "../../../skills");
  const workers = [
    createWorker("analyzer", { skillsPath }),
    createWorker("architect", { skillsPath }),
    createWorker("verifier", { skillsPath })
  ];

  // Create master agent
  const master = createMasterAgent({
    projectPath: targetPath,
    checkpointDir,
    workers,
    maxChunkSize: parseInt(process.env.JAVA_ARCHITECT_CHUNK_SIZE || "50"),
    maxParallelWorkers: parseInt(process.env.JAVA_ARCHITECT_PARALLEL || "3")
  });

  // Handle commands
  switch (command) {
    case "analyze":
    case "start":
      await master.start();
      break;

    case "resume":
      await master.start(true);
      break;

    case "status":
      await showStatus(checkpointDir);
      break;

    case "clean":
      await cleanCheckpoints(checkpointDir);
      break;

    case "plan":
      await showPlan(targetPath);
      break;

    default:
      error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }

  // Generate final report
  if (master.state && master.state.status === "completed") {
    await generateFinalReport(master, targetPath);
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Java Architect Master Agent CLI
================================

Usage: node master-agent.js <command> <target-path> [options]

Commands:
  analyze     Start full analysis (default)
  resume      Resume from checkpoint
  status       Show analysis status
  clean        Clean checkpoint files
  plan         Show analysis plan without executing

Options:
  JAVA_ARCHITECT_CHUNK_SIZE      Files per chunk (default: 50)
  JAVA_ARCHITECT_PARALLEL         Max parallel workers (default: 3)

Examples:
  # Analyze a project
  node master-agent.js analyze /path/to/java/project

  # Resume interrupted analysis
  node master-agent.js resume /path/to/java/project

  # Show current status
  node master-agent.js status

  # Clean checkpoints
  node master-agent.js clean

Environment Variables:
  JAVA_ARCHITECT_CHUNK_SIZE=50     Number of files per chunk
  JAVA_ARCHITECT_PARALLEL=3         Max parallel workers
`);
}

/**
 * Show analysis status
 */
async function showStatus(checkpointDir) {
  if (!fs.existsSync(checkpointDir)) {
    console.log("No analysis sessions found.");
    return;
  }

  const files = fs.readdirSync(checkpointDir);
  const stateFiles = files.filter(f => f.startsWith("state-") && f.endsWith(".json"));

  if (stateFiles.length === 0) {
    console.log("No analysis sessions found.");
    return;
  }

  console.log("\n📊 Analysis Sessions:\n");

  for (const file of stateFiles) {
    try {
      const stateData = JSON.parse(fs.readFileSync(path.join(checkpointDir, file), "utf-8"));
      const summary = {
        id: stateData.sessionId.substring(0, 8),
        status: stateData.status,
        progress: AnalysisState.hasExistingSession(stateData.projectPath, checkpointDir) ? "resumable" : "completed",
        chunks: `${stateData.completedChunks?.length || 0}/${stateData.completedChunks?.length + stateData.pendingChunks?.length || 0}`
      };

      console.log(`  ${summary.id} | ${summary.status.padEnd(12)} | ${summary.progress} | ${summary.resumable ? "🔄" : "✓"}`);
    } catch (e) {
      // Invalid file
    }
  }

  console.log("");
}

/**
 * Clean checkpoint files
 */
async function cleanCheckpoints(checkpointDir) {
  if (!fs.existsSync(checkpointDir)) {
    console.log("No checkpoints to clean.");
    return;
  }

  const files = fs.readdirSync(checkpointDir);
  let cleaned = 0;

  for (const file of files) {
    if (file.startsWith("state-") || file.startsWith("result-")) {
      fs.unlinkSync(path.join(checkpointDir, file));
      cleaned++;
    }
  }

  console.log(`Cleaned ${cleaned} checkpoint file(s).`);
}

/**
 * Show analysis plan without executing
 */
async function showPlan(targetPath) {
  console.log("\n📋 Analysis Plan\n");
  console.log(`Target: ${targetPath}`);
  console.log("Scanning project...\n");

  const tempAgent = createMasterAgent({
    projectPath: targetPath,
    checkpointDir: "/tmp/java-architect-plan",
    workers: []
  });

  await tempAgent.phasePlanning();
  await tempAgent.phaseChunking();

  // Clean up temp checkpoint
  fs.rmSync("/tmp/java-architect-plan", { recursive: true, force: true });
}

/**
 * Generate final report
 */
async function generateFinalReport(master, targetPath) {
  console.log("\n📄 Generating Final Report...");

  const reportPath = path.join(process.cwd(), "java-architect-master-report.json");
  const reportData = {
    sessionId: master.state.sessionId,
    projectPath: targetPath,
    startTime: master.state.startTime,
    endTime: Date.now(),
    duration: Date.now() - master.state.startTime,
    status: master.state.status,
    summary: master.state.getSummary(),
    plan: master.state.metadata.plan,
    aggregated: master.state.metadata.aggregated,
    verified: master.state.metadata.verified,
    results: master.state.results
  };

  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.error(`✓ Report saved to: ${reportPath}\n`);

  // Print human-readable summary
  console.log("=".repeat(60));
  console.log("  📊 Analysis Summary");
  console.log("=".repeat(60));
  console.log(`Session:      ${master.state.sessionId.substring(0, 16)}`);
  console.log(`Duration:     ${Math.round(reportData.duration / 1000)}s`);
  console.log(`Chunks:       ${master.state.completedChunks.length}`);
  console.log(`Issues:       ${reportData.aggregated?.totalIssues || 0}`);
  console.log("=".repeat(60) + "\n");
}

// Run main
main().catch(err => {
  error(err.message);
  process.exit(1);
});
