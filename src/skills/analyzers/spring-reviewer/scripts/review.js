#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";

// Import shared utilities from lib/
import { log, success, warn, error } from "../../../../lib/logger.js";
import { downloadWithFallback } from "../../../../lib/downloader.js";
import { runCommand } from "../../../../lib/process.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const silent = process.env.MCP_INSTALL_SILENT;

// Check if Ollama is available
const USE_OLLAMA = process.env.SPRING_REVIEWER_USE_OLLAMA === '1' || process.argv.includes('--ollama');

// --- PMD Installation ---

async function installPmd() {
  if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true });
  if (fs.existsSync(PMD_BIN)) return true;

  const zipPath = path.join(TOOLS_DIR, `pmd-${PMD_VERSION}.zip`);

  const downloaded = await downloadWithFallback(PMD_URLS, zipPath, (url) => {
    log(`Downloading from: ${url}`);
  });

  if (!downloaded) return false;

  success(`Downloaded to ${zipPath}`);
  log("Extracting...");
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(TOOLS_DIR, true);
  fs.unlinkSync(zipPath);

  if (process.platform !== "win32") {
    fs.chmodSync(PMD_BIN, 0o755);
  }

  success(`Extracted to ${PMD_DIR}`);
  return true;
}

// --- PMD Analysis ---

async function runPmd(targetPath, rulesPath) {
  log(`Running PMD analysis on: ${targetPath}`);

  const { stdout, stderr, code } = await runCommand(PMD_BIN, [
    "check",
    "-d", targetPath,
    "-R", rulesPath,
    "-f", "json",
    "--no-cache"
  ]);

  if (code !== 0 && code !== 4) {
    error(`PMD Failed (Code ${code}): ${stderr}`);
    return null;
  }

  try {
    const json = JSON.parse(stdout);
    success(`PMD found ${json.files ? json.files.length : 0} files with issues`);
    return json;
  } catch (e) {
    warn("Failed to parse JSON output");
    return { raw: stdout };
  }
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

// --- Java Code Analysis ---

function extractPackage(content) {
  const match = content.match(/package\s+([\w.]+);/);
  return match ? match[1] : null;
}

function extractClassName(content) {
  const match = content.match(/(?:public\s+)?class\s+(\w+)/);
  return match ? match[1] : null;
}

function extractImports(content) {
  const matches = content.matchAll(/import\s+([\w.]+);/g);
  return Array.from(matches).map(m => m[1]);
}

function extractMethods(content) {
  const methods = [];
  const methodPattern = /(?:@.*?)?\s*(?:public|private|protected)?\s*(?:static)?\s*(?:[\w<>[\],\s]*)\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  let match;
  while ((match = methodPattern.exec(content)) !== null) {
    methods.push({
      name: match[1],
      line: content.substring(0, match.index).split('\n').length
    });
  }
  return methods;
}

function extractDependencies(content) {
  const deps = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    if (line.includes('@Autowired') || line.includes('@Resource') || line.includes('@Inject')) {
      for (let i = 1; i <= 3; i++) {
        if (lines[idx + i]) {
          const fieldMatch = lines[idx + i].match(/(?:private|protected|public)\s+(?:[\w<>[\],\s]*)\s+(\w+)/);
          if (fieldMatch) {
            deps.push({
              name: fieldMatch[1],
              line: idx + i + 1
            });
            break;
          }
        }
      }
    }
  });

  return deps;
}

function extractAnnotations(content) {
  const annotations = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const matches = line.matchAll(/@(\w+)/g);
    for (const match of matches) {
      annotations.push({
        name: match[1],
        line: idx + 1
      });
    }
  });

  return annotations;
}

function extractSpringComponents(content) {
  const components = [];

  if (content.includes('@RestController')) components.push('RestController');
  if (content.includes('@Controller')) components.push('Controller');
  if (content.includes('@Service')) components.push('Service');
  if (content.includes('@Repository')) components.push('Repository');
  if (content.includes('@Component')) components.push('Component');
  if (content.includes('@Configuration')) components.push('Configuration');

  return components;
}

function analyzeJavaFile(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, "utf-8");
  const info = {
    path: filePath,
    package: extractPackage(content),
    className: extractClassName(content),
    imports: extractImports(content),
    methods: extractMethods(content),
    dependencies: extractDependencies(content),
    annotations: extractAnnotations(content),
    springComponents: extractSpringComponents(content),
    sourceCode: content // Include source code for LLM analysis
  };

  if (info.className) {
    return info;
  }
  return null;
}

function findJavaFiles(targetPath) {
  const javaFiles = [];

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    return [targetPath];
  }

  function scan(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'target', 'build', '.idea'].includes(entry.name)) {
          scan(fullPath);
        }
      } else if (entry.name.endsWith('.java')) {
        javaFiles.push(fullPath);
      }
    }
  }

  scan(targetPath);
  return javaFiles;
}

function buildCallChain(javaFiles, pmdResults) {
  const fileAnalysis = new Map();

  let analyzedCount = 0;
  for (const file of javaFiles) {
    const info = analyzeJavaFile(file);
    if (info) {
      const key = info.package ? `${info.package}.${info.className}` : info.className;
      fileAnalysis.set(key, info);
      analyzedCount++;
    }
  }

  if (!silent) {
    log(`Analyzed ${analyzedCount} classes from ${javaFiles.length} files`);
  }

  // Find entry points
  const entryPoints = [];
  for (const [key, info] of fileAnalysis) {
    const hasRestMapping = info.annotations.some(a =>
      ['GetMapping', 'PostMapping', 'RequestMapping', 'PatchMapping', 'PutMapping', 'DeleteMapping'].includes(a.name)
    );
    const isService = info.springComponents.includes('Service');
    const isComponent = info.springComponents.includes('Component');
    const hasTransactional = info.annotations.some(a => a.name === 'Transactional');
    const hasAsync = info.annotations.some(a => a.name === 'Async');
    const hasScheduled = info.annotations.some(a => a.name === 'Scheduled');
    const hasJobHandler = info.annotations.some(a => a.name === 'JobHandler');

    if (hasRestMapping ||
        (isService && (hasTransactional || hasAsync)) ||
        hasScheduled ||
        hasJobHandler ||
        (isComponent && hasAsync)) {
      entryPoints.push(info);
    }
  }

  return {
    entryPoints: entryPoints.slice(0, 5), // Limit to 5 for focused review
    fileAnalysis: Object.fromEntries(fileAnalysis),
    totalFiles: javaFiles.length
  };
}

/**
 * Call Ollama for LLM analysis
 */
async function callOllama(prompt, model = "llama3.2") {
  try {
    const { stdout, stderr, code } = await runCommand("ollama", [
      "run", model, prompt
    ], {
      timeout: 120000 // 2 minute timeout
    });

    if (code !== 0) {
      warn(`Ollama call failed: ${stderr}`);
      return null;
    }

    return stdout;
  } catch (e) {
    warn(`Ollama not available: ${e.message}`);
    return null;
  }
}

/**
 * Generate LLM prompt for code review
 */
function generateLLMPrompt(targetPath, pmdResults, callChain) {
  const promptParts = [];

  // Header
  promptParts.push(`# Spring Code Review Request`);
  promptParts.push(`Please review the following Spring Boot code for potential issues.`);
  promptParts.push(``);
  promptParts.push(`## Context`);
  promptParts.push(`- **Target**: ${targetPath}`);
  promptParts.push(`- **Files**: ${callChain.totalFiles} Java files`);
  promptParts.push(`- **PMD Issues**: ${pmdResults.length} violations found`);
  promptParts.push(`- **Entry Points**: ${callChain.entryPoints.length} identified`);
  promptParts.push(``);

  // PMD Issues (if any)
  if (pmdResults.length > 0) {
    promptParts.push(`## PMD Static Analysis Results`);
    promptParts.push(`The following issues were detected by PMD:`);
    promptParts.push(``);

    const critical = pmdResults.filter(r => r.priority <= 2).slice(0, 10);
    for (const issue of critical) {
      const fileName = path.basename(issue.file);
      promptParts.push(`- [${issue.file}:${issue.line}] **${issue.rule}**: ${issue.description}`);
    }
    promptParts.push(``);
  }

  // Entry Points Analysis
  promptParts.push(`## Entry Points to Review`);
  promptParts.push(``);

  for (let i = 0; i < callChain.entryPoints.length; i++) {
    const entry = callChain.entryPoints[i];
    const className = entry.package ? `${entry.package}.${entry.className}` : entry.className;
    const fileName = path.basename(entry.path);

    promptParts.push(`### ${i + 1}. ${className}`);
    promptParts.push(``);
    promptParts.push(`**File**: \`${fileName}\``);
    promptParts.push(``);
    promptParts.push(`**Annotations**: ${entry.annotations.map(a => '@' + a.name).join(', ')}`);
    promptParts.push(``);

    if (entry.dependencies.length > 0) {
      promptParts.push(`**Dependencies**:`);
      for (const dep of entry.dependencies) {
        promptParts.push(`- \`${dep.name}\` (field injection)`);
      }
      promptParts.push(``);
    }

    // Include relevant source code snippet
    promptParts.push(`**Key Methods**:`);
    const keyMethods = entry.methods.slice(0, 5);
    for (const method of keyMethods) {
      promptParts.push(`- \`${method.name}()\` (line ${method.line})`);
    }
    promptParts.push(``);

    // Get PMD issues for this file
    const fileIssues = pmdResults.filter(r => r.file === entry.path);
    if (fileIssues.length > 0) {
      promptParts.push(`**PMD Issues in this class**:`);
      for (const issue of fileIssues.slice(0, 5)) {
        promptParts.push(`- Line ${issue.line}: \`${issue.rule}\` - ${issue.description}`);
      }
      promptParts.push(``);
    }

    promptParts.push(`---`);
    promptParts.push(``);
  }

  // Review Guidelines
  promptParts.push(`## Review Guidelines`);
  promptParts.push(``);
  promptParts.push(`Focus on these areas:`);
  promptParts.push(``);
  promptParts.push(`1. **Spring AOP Issues**`);
  promptParts.push(`   - @Transactional/@Async/@Cacheable on private/final methods (AOP proxy won't work)`);
  promptParts.push(`   - Self-invocation of @Transactional methods`);
  promptParts.push(`   - Method visibility for cross-cutting concerns`);
  promptParts.push(``);
  promptParts.push(`2. **Dependency Injection**`);
  promptParts.push(`   - Field injection via @Autowired (prefer constructor injection)`);
  promptParts.push(`   - Circular dependencies`);
  promptParts.push(`   - Missing @Lazy for lazy initialization`);
  promptParts.push(``);
  promptParts.push(`3. **Thread Safety**`);
  promptParts.push(`   - @Async methods and shared mutable state`);
  promptParts.push(`   - Thread-safe collections`);
  promptParts.push(`   - Static formatters/date formats`);
  promptParts.push(``);
  promptParts.push(`4. **Transaction Management**`);
  promptParts.push(`   - Transaction boundary correctness`);
  promptParts.push(`   - @Transactional propagation`);
  promptParts.push(`   - Rollback behavior`);
  promptParts.push(``);
  promptParts.push(`5. **Error Handling**`);
  promptParts.push(`   - Empty catch blocks`);
  promptParts.push(`   - Swallowed exceptions`);
  promptParts.push(`   - Exception chain preservation`);
  promptParts.push(``);

  // Request
  promptParts.push(`## Request`);
  promptParts.push(``);
  promptParts.push(`Please provide:`);
  promptParts.push(``);
  promptParts.push(`1. **Summary**: A 3-5 sentence executive summary of code quality`);
  promptParts.push(`2. **Critical Issues**: List any critical bugs that could cause production failures`);
  promptParts.push(`3. **Code Smells**: List antipatterns and violations of Spring best practices`);
  promptParts.push(`4. **Recommendations**: Specific, actionable suggestions for improvement`);
  promptParts.push(``);
  promptParts.push(`Format your response as structured markdown with clear sections.`);

  return promptParts.join('\n');
}

/**
 * Generate comprehensive review report
 */
function generateReport(targetPath, pmdResults, callChain, llmResponse) {
  const lines = [];

  lines.push("# Spring Progressive Code Review Report");
  lines.push("");
  lines.push(`**Target**: ${targetPath}`);
  lines.push(`**Files Analyzed**: ${callChain.totalFiles}`);
  lines.push(`**PMD Issues Found**: ${pmdResults.length}`);
  lines.push(`**Entry Points**: ${callChain.entryPoints.length}`);
  lines.push(`**LLM Analysis**: ${llmResponse ? "Included below" : "Not available"}`);
  lines.push("");

  // PMD Summary
  lines.push("## 1. PMD Static Analysis");
  lines.push("");

  const byPriority = {};
  for (const r of pmdResults) {
    if (!byPriority[r.priority]) byPriority[r.priority] = [];
    byPriority[r.priority].push(r);
  }

  if (Object.keys(byPriority).length > 0) {
    lines.push("| Priority | Count |");
    lines.push("|----------|-------|");
    for (const [p, issues] of Object.entries(byPriority).sort((a, b) => a[0] - b[0])) {
      lines.push(`| ${p} | ${issues.length} |`);
    }
    lines.push("");
  }

  // Top Issues
  lines.push("### Critical Issues (Priority 1-2)");
  lines.push("");
  const critical = pmdResults.filter(r => r.priority <= 2).slice(0, 20);
  if (critical.length > 0) {
    for (const issue of critical) {
      const fileName = path.basename(issue.file);
      lines.push(`- **${issue.rule}** - ${fileName}:${issue.line}`);
      lines.push(`  ${issue.description}`);
    }
  } else {
    lines.push("No critical PMD issues found!");
  }
  lines.push("");

  // LLM Analysis
  if (llmResponse) {
    lines.push("## 2. LLM Semantic Analysis");
    lines.push("");
    lines.push(llmResponse);
    lines.push("");
  }

  // Call Chain Analysis
  lines.push("## 3. Call Chain Analysis");
  lines.push("");
  lines.push(`### Entry Points (${callChain.entryPoints.length})`);
  lines.push("");

  for (const entry of callChain.entryPoints) {
    const className = entry.package ? `${entry.package}.${entry.className}` : entry.className;
    const fileName = path.basename(entry.path);
    const fileIssues = pmdResults.filter(r => r.file === entry.path).length;

    lines.push(`#### ${className}`);
    lines.push(`- **File**: \`${fileName}\``);
    lines.push(`- **PMD Issues**: ${fileIssues}`);
    lines.push(`- **Annotations**: ${entry.annotations.map(a => '@' + a.name).join(', ')}`);

    if (entry.dependencies.length > 0) {
      lines.push(`- **Dependencies**: ${entry.dependencies.map(d => d.name).join(', ')}`);
    }
    lines.push("");
  }

  // JSON for programmatic access
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 4. Structured Data (for automation)");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify({
    summary: {
      target: targetPath,
      filesAnalyzed: callChain.totalFiles,
      pmdIssues: pmdResults.length,
      entryPoints: callChain.entryPoints.length
    },
    pmdResults: pmdResults.slice(0, 100), // Limit to 100 issues
    callChain: {
      entryPoints: callChain.entryPoints.map(e => ({
        className: e.package ? `${e.package}.${e.className}` : e.className,
        path: e.path,
        annotations: e.annotations,
        dependencies: e.dependencies,
        methods: e.methods.slice(0, 10)
      }))
    }
  }, null, 2));
  lines.push("```");

  return lines.join('\n');
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
    error("Usage: node review.js <target_path> [--ollama]");
    process.exit(1);
  }

  console.error("\n" + "═".repeat(60));
  console.error("  📋 Spring Progressive Code Review");
  console.error("  PMD + LLM Semantic Analysis");
  console.error("═".repeat(60) + "\n");

  // 3. Step 1: PMD Analysis
  log("Step 1: Running PMD static analysis...");
  const rulesPath = path.join(__dirname, "..", "config", "critical-rules.xml");
  if (!fs.existsSync(rulesPath)) {
    error(`Rules file not found: ${rulesPath}`);
    process.exit(1);
  }

  const pmdResult = await runPmd(targetPath, rulesPath);
  if (!pmdResult) {
    error("PMD analysis failed");
    process.exit(1);
  }

  const simplifiedResults = simplifyResults(pmdResult);
  success(`PMD analysis complete: ${simplifiedResults.length} issues found\n`);

  // 4. Step 2: Code Structure Analysis
  log("Step 2: Analyzing code structure and call chains...");
  const javaFiles = findJavaFiles(targetPath);
  success(`Found ${javaFiles.length} Java files\n`);

  const callChain = buildCallChain(javaFiles, simplifiedResults);
  success(`Identified ${callChain.entryPoints.length} entry points\n`);

  // 5. Step 3: Generate LLM Prompt
  log("Step 3: Preparing LLM analysis prompt...");
  const llmPrompt = generateLLMPrompt(targetPath, simplifiedResults, callChain);
  success("Generated structured prompt\n");

  // 6. Step 4: Call LLM (if enabled)
  let llmResponse = null;
  if (USE_OLLAMA) {
    log("Step 4: Calling Ollama for LLM analysis...");
    log("This may take 1-2 minutes...\n");
    llmResponse = await callOllama(llmPrompt);
    if (llmResponse) {
      success("LLM analysis complete\n");
    } else {
      warn("LLM analysis failed, continuing with PMD-only report\n");
    }
  } else {
    log("Step 4: LLM analysis skipped (use --ollama to enable)");
    log("Install Ollama: https://ollama.ai");
    log("Then run: node review.js /path/to/code --ollama\n");
  }

  // 7. Step 5: Generate Final Report
  log("Step 5: Generating comprehensive report...");
  const report = generateReport(targetPath, simplifiedResults, callChain, llmResponse);

  console.log(report);

  // Save report
  const reportPath = path.join(process.cwd(), "spring-review-report.md");
  fs.writeFileSync(reportPath, report);
  console.error(`\n✓ Report saved to: ${reportPath}\n`);

  // Save LLM prompt for manual use
  const promptPath = path.join(process.cwd(), "spring-review-prompt.txt");
  fs.writeFileSync(promptPath, llmPrompt);
  console.error(`✓ LLM prompt saved to: ${promptPath}\n`);

  console.error("═".repeat(60));
  success("Review complete!");
  console.error("═".repeat(60) + "\n");

  if (!llmResponse && !USE_OLLAMA) {
    console.error("💡 To get AI-powered analysis, you can:");
    console.error("   1. Install Ollama: https://ollama.ai");
    console.error("   2. Run with: node review.js /path/to/code --ollama");
    console.error("   3. Or copy spring-review-prompt.txt to Claude/ChatGPT\n");
  }
})();
