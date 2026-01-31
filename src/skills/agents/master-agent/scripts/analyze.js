#!/usr/bin/env node

import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);

import path from "path";

import { log, success, warn, error } from "../../../../lib/logger.js";
import { createMasterAgent } from "../../../../lib/master-agent.js";
import { createWorker } from "../../../../lib/worker-agents.js";

/**
 * Master Agent: Analyze
 * Distributed analysis with chunking and checkpoint support
 */
async function analyze(targetPath, options = {}) {
  const chunkSize = options.chunk_size || 50;
  const parallel = options.parallel !== false;

  log("Starting distributed Java analysis...");
  log(`Target: ${targetPath}`);
  log(`Chunk size: ${chunkSize} files`);
  log(`Parallel: ${parallel ? "enabled" : "disabled"}\n`);

  // Create workers
  const skillsPath = path.join(__dirname, "../../../skills");
  const workers = [
    createWorker("analyzer", { skillsPath, projectPath: targetPath }),
    createWorker("architect", { skillsPath, projectPath: targetPath })
  ];

  // Create master agent
  const master = createMasterAgent({
    projectPath: targetPath,
    checkpointDir: path.join(process.cwd(), ".java-archient-checkpoints"),
    workers,
    maxChunkSize: chunkSize,
    maxParallelWorkers: parallel ? 3 : 1
  });

  // Run analysis
  try {
    const state = await master.start();

    success(`Analysis complete!`);
    console.log(`\nSession: ${state.sessionId}`);
    console.log(`Duration: ${Math.round((Date.now() - state.startTime) / 1000)}s`);
    console.log(`Chunks: ${state.completedChunks.length}`);
    console.log(`Issues found: ${state.metadata.aggregated?.totalIssues || 0}`);

    return state;

  } catch (err) {
    error(`Analysis failed: ${err.message}`);

    // Show resume instructions
    console.log("\n💡 To resume this analysis later:");
    console.log(`   master-agent-resume target_path="${targetPath}"`);

    throw err;
  }
}

// Main
(async () => {
  const targetPath = process.argv[2];
  if (!targetPath) {
    error("Usage: node analyze.js <target_path> [chunk_size]");
    process.exit(1);
  }

  const chunkSize = parseInt(process.argv[3]) || 50;

  await analyze(targetPath, { chunk_size: chunkSize });
})();
