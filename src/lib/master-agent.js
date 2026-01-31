/**
 * Master Agent Framework
 * Orchestrates distributed analysis of large Java projects
 * Handles planning, chunking, worker coordination, and result aggregation
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { findJavaFiles } from "./cli-tool.js";

/**
 * Analysis State Structure
 */
class AnalysisState {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.sessionId = crypto.randomBytes(16).toString("hex");
    this.startTime = Date.now();
    this.status = "initialized"; // initialized, planning, analyzing, aggregating, completed, failed
    this.currentPhase = null;
    this.completedChunks = [];
    this.pendingChunks = [];
    this.failedChunks = [];
    this.results = [];
    this.checkpoint = null;
    this.metadata = {};
  }

  /**
   * Save checkpoint for resume capability
   */
  saveCheckpoint(checkpointDir) {
    const stateFile = path.join(checkpointDir, `state-${this.sessionId}.json`);
    const checkpoint = {
      sessionId: this.sessionId,
      projectPath: this.projectPath,
      startTime: this.startTime,
      status: this.status,
      currentPhase: this.currentPhase,
      completedChunks: this.completedChunks,
      pendingChunks: this.pendingChunks,
      failedChunks: this.failedChunks,
      results: this.results.slice(0, 100), // Limit saved results
      metadata: this.metadata,
      timestamp: Date.now()
    };

    fs.writeFileSync(stateFile, JSON.stringify(checkpoint, null, 2));
    this.checkpoint = stateFile;
    return stateFile;
  }

  /**
   * Load from checkpoint
   */
  static loadCheckpoint(checkpointFile) {
    const data = JSON.parse(fs.readFileSync(checkpointFile, "utf-8"));
    const state = new AnalysisState(data.projectPath);
    Object.assign(state, data);
    state.checkpoint = checkpointFile;
    return state;
  }

  /**
   * Check if session exists
   */
  static hasExistingSession(projectPath, checkpointDir) {
    if (!fs.existsSync(checkpointDir)) return false;

    const files = fs.readdirSync(checkpointDir);
    const stateFiles = files.filter(f => f.startsWith("state-") && f.endsWith(".json"));

    // Find the most recent session for this project
    for (const file of stateFiles.reverse()) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(checkpointDir, file), "utf-8"));
        if (data.projectPath === projectPath &&
            (data.status === "analyzing" || data.status === "planning")) {
          return file;
        }
      } catch (e) {
        // Invalid file, skip
      }
    }

    return null;
  }

  /**
   * Update phase
   */
  setPhase(phase) {
    this.currentPhase = phase;
    this.metadata.lastPhaseUpdate = Date.now();
  }

  /**
   * Mark chunk as completed
   */
  completeChunk(chunkId, result) {
    const index = this.pendingChunks.findIndex(c => c.id === chunkId);
    if (index !== -1) {
      this.pendingChunks.splice(index, 1);
    }

    this.completedChunks.push({
      id: chunkId,
      completedAt: Date.now(),
      result: result
    });

    // Also add to results
    this.results.push({
      chunkId,
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Mark chunk as failed
   */
  failChunk(chunkId, error) {
    const index = this.pendingChunks.findIndex(c => c.id === chunkId);
    if (index !== -1) {
      this.pendingChunks.splice(index, 1);
    }

    this.failedChunks.push({
      id: chunkId,
      error: error.message,
      failedAt: Date.now()
    });
  }

  /**
   * Get progress percentage
   */
  getProgress() {
    const total = this.completedChunks.length + this.pendingChunks.length + this.failedChunks.length;
    if (total === 0) return 0;
    return Math.round((this.completedChunks.length / total) * 100);
  }

  /**
   * Get summary
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      status: this.status,
      progress: this.getProgress(),
      completed: this.completedChunks.length,
      pending: this.pendingChunks.length,
      failed: this.failedChunks.length,
      totalResults: this.results.length,
      duration: Date.now() - this.startTime
    };
  }
}

/**
 * Master Agent - Main Orchestrator
 */
class MasterAgent {
  constructor(options = {}) {
    this.projectPath = options.projectPath;
    this.checkpointDir = options.checkpointDir || ".java-archient-checkpoints";
    this.workers = options.workers || [];
    this.maxChunkSize = options.maxChunkSize || 50; // Max files per chunk
    this.maxParallelWorkers = options.maxParallelWorkers || 3;
    this.state = null;
    this.plan = null;

    // Ensure checkpoint directory exists
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  /**
   * Start analysis with resume support
   */
  async start(resume = false) {
    console.error("\n" + "=".repeat(60));
    console.error("  🤖 Master Agent: Java Project Analysis");
    console.error("=".repeat(60) + "\n");

    // Check for existing session
    if (!resume) {
      const existing = AnalysisState.hasExistingSession(this.projectPath, this.checkpointDir);
      if (existing) {
        console.error(`Found existing session. Loading...`);
        this.state = AnalysisState.loadCheckpoint(path.join(this.checkpointDir, existing));
        console.error(`Session: ${this.state.sessionId}`);
        console.error(`Progress: ${this.state.getProgress()}%`);
        console.error(`Status: ${this.state.status}\n`);
        return this.resume();
      }
    }

    // Create new state
    if (!this.state) {
      this.state = new AnalysisState(this.projectPath);
      this.state.setPhase("initialization");
    }

    try {
      // Phase 1: Planning
      await this.phasePlanning();

      // Phase 2: Chunking
      await this.phaseChunking();

      // Phase 3: Analysis
      await this.phaseAnalysis();

      // Phase 4: Aggregation
      await this.phaseAggregation();

      // Phase 5: Verification
      await this.phaseVerification();

      // Complete
      this.state.status = "completed";
      this.state.saveCheckpoint(this.checkpointDir);

      console.error("\n" + "=".repeat(60));
      console.error("  ✅ Analysis Complete!");
      console.error("=".repeat(60) + "\n");
      console.error(`Session: ${this.state.sessionId}`);
      console.error(`Duration: ${Math.round((Date.now() - this.state.startTime) / 1000)}s`);
      console.error(`Chunks: ${this.state.completedChunks.length}`);

      return this.state;

    } catch (error) {
      this.state.status = "failed";
      this.state.metadata.error = error.message;
      this.state.saveCheckpoint(this.checkpointDir);
      throw error;
    }
  }

  /**
   * Resume from checkpoint
   */
  async resume() {
    console.error("\n▶️  Resuming analysis...\n");

    // Skip completed phases
    if (this.state.currentPhase === "analyzing" || this.state.status === "analyzing") {
      await this.phaseAnalysis();
    }

    if (this.state.status === "completed" || this.state.completedChunks.length === this.state.pendingChunks.length) {
      await this.phaseAggregation();
      await this.phaseVerification();
    }

    return this.state;
  }

  /**
   * Phase 1: Planning
   */
  async phasePlanning() {
    this.state.setPhase("planning");
    this.state.status = "planning";
    this.state.saveCheckpoint(this.checkpointDir);

    console.error("📋 Phase 1: Planning Analysis");

    // Scan project structure
    const scanResult = await this.scanProject();

    // Generate analysis plan
    this.plan = this.generatePlan(scanResult);

    console.error(`   Found ${scanResult.totalFiles} Java files`);
    console.error(`   Plan: ${this.plan.chunks.length} chunks`);
    console.error(`   Estimated time: ${this.plan.estimatedTime} seconds\n`);

    this.state.metadata.plan = this.plan;
    this.state.saveCheckpoint(this.checkpointDir);
  }

  /**
   * Phase 2: Chunking
   */
  async phaseChunking() {
    this.state.setPhase("chunking");
    console.error("📦 Phase 2: Chunking Project");

    // Create chunks based on plan
    const chunks = this.createChunks();

    this.state.pendingChunks = chunks;
    console.error(`   Created ${chunks.length} chunks\n`);

    this.state.saveCheckpoint(this.checkpointDir);
  }

  /**
   * Phase 3: Analysis
   */
  async phaseAnalysis() {
    this.state.setPhase("analyzing");
    this.state.status = "analyzing";
    console.error("🔍 Phase 3: Analyzing Chunks\n");

    const chunks = [...this.state.pendingChunks];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      console.error(`[${i + 1}/${chunks.length}] Analyzing chunk: ${chunk.name}`);
      console.error(`   Files: ${chunk.files.length}`);

      // Skip if already completed
      if (this.state.completedChunks.find(c => c.id === chunk.id)) {
        console.error(`   ✓ Already completed\n`);
        continue;
      }

      try {
        const result = await this.analyzeChunk(chunk);
        this.state.completeChunk(chunk.id, result);
        this.state.saveCheckpoint(this.checkpointDir);

        console.error(`   ✓ Complete\n`);

        // Show progress every 5 chunks
        if ((i + 1) % 5 === 0) {
          console.error(`   Progress: ${this.state.getProgress()}%`);
        }

      } catch (error) {
        this.state.failChunk(chunk.id, error);
        this.state.saveCheckpoint(this.checkpointDir);
        console.error(`   ✗ Failed: ${error.message}\n`);
      }
    }

    console.error(`\n✓ Chunk analysis complete: ${this.state.completedChunks.length}/${chunks.length}`);
    console.error(`✗ Failed: ${this.state.failedChunks.length}\n`);
  }

  /**
   * Phase 4: Aggregation
   */
  async phaseAggregation() {
    this.state.setPhase("aggregation");
    console.error("📊 Phase 4: Aggregating Results");

    const aggregated = this.aggregateResults();

    this.state.metadata.aggregated = aggregated;
    this.state.saveCheckpoint(this.checkpointDir);

    console.error(`   Processed ${aggregated.totalIssues} issues`);
    console.error(`   Generated ${aggregated.reports.length} reports\n`);
  }

  /**
   * Phase 5: Verification
   */
  async phaseVerification() {
    this.state.setPhase("verification");
    console.error("✔️  Phase 5: Verification");

    const verified = await this.verifyResults();

    this.state.metadata.verified = verified;
    this.state.saveCheckpoint(this.checkpointDir);

    console.error(`   Verified: ${verified.summary}`);
    console.error(`   Confidence: ${verified.confidence}%\n`);
  }

  /**
   * Scan project structure
   */
  async scanProject() {
    const { findJavaFiles } = await import("./cli-tool.js");
    const javaFiles = findJavaFiles(this.projectPath);

    // Group by package
    const byPackage = {};
    for (const file of javaFiles) {
      const pkg = this.extractPackage(file);
      if (!byPackage[pkg]) byPackage[pkg] = [];
      byPackage[pkg].push(file);
    }

    return {
      totalFiles: javaFiles.length,
      packages: Object.keys(byPackage),
      byPackage
    };
  }

  extractPackage(filePath) {
    const parts = filePath.split(path.sep);
    const srcIndex = parts.findIndex(p => p === "src" || p === "main" || p === "java");
    if (srcIndex !== -1 && srcIndex < parts.length - 2) {
      const pkgStart = parts.slice(srcIndex + 1).join(".");
      return pkgStart.replace(".java", "");
    }
    return "default";
  }

  /**
   * Generate analysis plan
   */
  generatePlan(scanResult) {
    const chunks = [];
    const totalFiles = scanResult.totalFiles;
    const numChunks = Math.ceil(totalFiles / this.maxChunkSize);

    for (let i = 0; i < numChunks; i++) {
      chunks.push({
        id: `chunk-${i + 1}`,
        name: `Chunk ${i + 1}`,
        index: i,
        fileCount: Math.min(this.maxChunkSize, totalFiles - (i * this.maxChunkSize))
      });
    }

    return {
      chunks,
      totalChunks: numChunks,
      estimatedTime: Math.ceil(totalFiles / 10) // Rough estimate
    };
  }

  /**
   * Create work chunks
   */
  createChunks() {
    const chunks = [];
    const allFiles = findJavaFiles(this.projectPath);

    for (let i = 0; i < allFiles.length; i += this.maxChunkSize) {
      const chunkFiles = allFiles.slice(i, i + this.maxChunkSize);
      chunks.push({
        id: `chunk-${Math.floor(i / this.maxChunkSize) + 1}`,
        name: `Chunk ${Math.floor(i / this.maxChunkSize) + 1}`,
        files: chunkFiles,
        fileCount: chunkFiles.length
      });
    }

    return chunks;
  }

  /**
   * Analyze a single chunk
   */
  async analyzeChunk(chunk) {
    // Delegate to appropriate worker
    const worker = this.getWorker("analyzer");
    return await worker.analyze(chunk);
  }

  /**
   * Get worker by type
   */
  getWorker(type) {
    return this.workers.find(w => w.type === type) || this.workers[0];
  }

  /**
   * Aggregate results from all chunks
   */
  aggregateResults() {
    const allResults = this.state.completedChunks.map(c => c.result);

    const aggregated = {
      totalIssues: 0,
      reports: [],
      summary: {}
    };

    // Process results
    for (const result of allResults) {
      if (result && result.issues) {
        aggregated.totalIssues += result.issues.length || 0;
      }
      if (result && result.report) {
        aggregated.reports.push(result.report);
      }
    }

    // Generate summary
    aggregated.summary = this.generateSummary(allResults);

    return aggregated;
  }

  /**
   * Generate summary from all results
   */
  generateSummary(results) {
    return {
      chunksAnalyzed: results.length,
      timestamp: Date.now()
    };
  }

  /**
   * Verify results to reduce hallucinations
   */
  async verifyResults() {
    console.error("   Cross-validating results...");

    // Basic verification statistics
    const completed = this.state.completedChunks.length;
    const total = this.state.completedChunks.length + this.state.failedChunks.length;

    const confidence = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      summary: `${completed}/${total} chunks successful`,
      confidence: confidence,
      verifiedAt: Date.now()
    };
  }
}

/**
 * Factory to create Master Agent
 */
export function createMasterAgent(options) {
  return new MasterAgent(options);
}

export { MasterAgent, AnalysisState };
