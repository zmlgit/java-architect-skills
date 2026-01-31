#!/usr/bin/env node

import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import path from "path";

import { log, success, warn, error } from "../../../../lib/logger.js";
import { createMasterAgent, AnalysisState } from "../../../../lib/master-agent.js";
import { createWorker } from "../../../../lib/worker-agents.js";

/**
 * Master Agent: Resume
 * Resume interrupted analysis from checkpoint
 */
async function resume(targetPath) {
  log("Resuming distributed Java analysis...");
  log(`Target: ${targetPath}\n`);

  const checkpointDir = path.join(process.cwd(), ".java-archient-checkpoints");

  // Find existing session
  const existing = AnalysisState.hasExistingSession(targetPath, checkpointDir);
  if (!existing) {
    error("No existing analysis session found for this project.");
    error("Use 'master-agent-analyze' to start a new analysis.");
    process.exit(1);
  }

  // Create workers
  const skillsPath = path.join(__dirname, "../../../skills");
  const workers = [
    createWorker("analyzer", { skillsPath }),
    createWorker("architect", { skillsPath })
  ];

  // Create master agent with existing session
  const master = createMasterAgent({
    projectPath: targetPath,
    checkpointDir,
    workers
  });

  // Load the state
  master.state = AnalysisState.loadCheckpoint(path.join(checkpointDir, existing));

  console.error(`Session: ${master.state.sessionId}`);
  console.error(`Progress: ${master.state.getProgress()}%\n`);

  // Resume
  try {
    const state = await master.start(true);

    success(`Resume complete!`);
    console.log(`\nSession: ${state.sessionId}`);
    console.log(`Duration: ${Math.round((Date.now() - state.startTime) / 1000)}s`);

    return state;

  } catch (err) {
    error(`Resume failed: ${err.message}`);
    throw err;
  }
}

// Main
(async () => {
  const targetPath = process.argv[2];
  if (!targetPath) {
    error("Usage: node resume.js <target_path>");
    process.exit(1);
  }

  await resume(targetPath);
})();
