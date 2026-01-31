#!/usr/bin/env node

import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import fs from "fs";
import path from "path";

import { log, success, warn, error } from "../../../../lib/logger.js";
import { AnalysisState } from "../../../../lib/master-agent.js";

/**
 * Master Agent: Status
 * Show analysis status and progress
 */
async function showStatus() {
  const checkpointDir = path.join(process.cwd(), ".java-archient-checkpoints");

  if (!fs.existsSync(checkpointDir)) {
    console.log("No analysis sessions found.\n");
    console.log("To start an analysis, use:");
    console.log("  master-agent-analyze target_path=\"/path/to/project\"");
    return;
  }

  const files = fs.readdirSync(checkpointDir);
  const stateFiles = files.filter(f => f.startsWith("state-") && f.endsWith(".json"));

  if (stateFiles.length === 0) {
    console.log("No analysis sessions found.\n");
    return;
  }

  console.log("\n📊 Analysis Sessions\n");
  console.log("─".repeat(60));

  let hasActive = false;

  for (const file of stateFiles) {
    try {
      const stateData = JSON.parse(fs.readFileSync(path.join(checkpointDir, file), "utf-8"));
      const isResumable = AnalysisState.hasExistingSession(stateData.projectPath, checkpointDir) !== null;
      const isRunning = stateData.status === "planning" || stateData.status === "analyzing";

      if (isRunning || isResumable) {
        hasActive = true;
      }

      const statusIcon = stateData.status === "completed" ? "✓" : isRunning ? "▶️" : "⏸️";
      const progress = Math.round(
        ((stateData.completedChunks?.length || 0) /
        ((stateData.completedChunks?.length || 0) + (stateData.pendingChunks?.length || 0))) * 100
      );

      console.log(`\n${statusIcon} Session: ${stateData.sessionId.substring(0, 16)}`);
      console.log(`   Status: ${stateData.status}`);
      console.log(`   Progress: ${progress}%`);
      console.log(`   Chunks: ${stateData.completedChunks?.length || 0}/${(stateData.completedChunks?.length || 0) + (stateData.pendingChunks?.length || 0)}`);
      console.log(`   Target: ${stateData.projectPath}`);

      if (isRunning) {
        console.log(`   ⏱️  Duration: ${Math.round((Date.now() - stateData.startTime) / 1000)}s`);
      } else if (stateData.status === "completed") {
        console.log(`   ✅ Duration: ${Math.round((stateData.endTime - stateData.startTime) / 1000)}s`);
      }

    } catch (e) {
      // Invalid file
    }
  }

  console.log("\n" + "─".repeat(60));

  if (hasActive) {
    console.log("\n💡 Resume with:");
    console.log("   master-agent-resume target_path=\"<project_path>\"");
  }

  console.log();
}

// Main
showStatus().catch(err => {
  error(`Error: ${err.message}`);
  process.exit(1);
});
