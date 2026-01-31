#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { log, success, warn, error } from "../../../../lib/logger.js";
import { parseClassInfo, findJavaFiles } from "../../../../lib/java-parser.js";

/**
 * SOLID Principles Checker
 */

const solidChecks = {
  // Single Responsibility Principle
  srp: (classInfo, content) => {
    const issues = [];
    const loc = countLOC(content);

    // Too many methods = multiple responsibilities
    if (classInfo.methods.length > 15) {
      issues.push({
        principle: "Single Responsibility",
        score: 2,
        issue: `Class has ${classInfo.methods.length} methods, likely handling multiple responsibilities`,
        suggestion: "Extract Class: Split into focused classes with single responsibilities"
      });
    }

    // God class
    if (loc > 500) {
      issues.push({
        principle: "Single Responsibility",
        score: 1,
        issue: `Class is ${loc} lines - doing too much`,
        suggestion: "Extract Class: Break down into smaller, cohesive classes"
      });
    }

    // Mixed naming patterns suggest mixed concerns
    const prefixes = classInfo.methods.map(m => m.name.substring(0, 3).toLowerCase());
    const uniquePrefixes = new Set(prefixes);
    if (uniquePrefixes.size > 5) {
      issues.push({
        principle: "Single Responsibility",
        score: 3,
        issue: "Method names suggest multiple functional areas",
        suggestion: "Consider if this class has too many reasons to change"
      });
    }

    if (issues.length === 0) {
      return { principle: "Single Responsibility", score: 5, issues: [] };
    }
    return { principle: "Single Responsibility", score: issues[0].score, issues };
  },

  // Open/Closed Principle
  ocp: (classInfo, content) => {
    const issues = [];

    // Check for type codes or instanceof chains
    const instanceofMatches = content.match(/instanceof\s+\w+/g) || [];
    if (instanceofMatches.length > 3) {
      issues.push({
        principle: "Open/Closed",
        score: 2,
        issue: `Found ${instanceofMatches.length} instanceof checks - should use polymorphism`,
        suggestion: "Replace Conditional with Polymorphism: Create proper inheritance hierarchy"
      });
    }

    // Long if-else or switch chains
    const ifElseChains = (content.match(/if\s*\([^)]+\)\s*\{[\s\S]{100,}/g) || []).length;
    if (ifElseChains > 2) {
      issues.push({
        principle: "Open/Closed",
        score: 3,
        issue: "Complex conditional logic - not open for extension",
        suggestion: "Use Strategy Pattern: Encapsulate algorithms in separate classes"
      });
    }

    if (issues.length === 0) {
      return { principle: "Open/Closed", score: 5, issues: [] };
    }
    return { principle: "Open/Closed", score: issues[0].score, issues };
  },

  // Liskov Substitution Principle
  lsp: (classInfo, content) => {
    const issues = [];

    // Check for inheritance
    if (classInfo.extendsClass) {
      // Check for empty override methods
      const emptyMethods = classInfo.methods.filter(m => {
        // Would need AST to properly detect empty overrides
        return false;
      });

      // Check for @Override with different behavior signatures
      const hasThrowsException = content.includes('throws Exception');
      if (hasThrowsException) {
        issues.push({
          principle: "Liskov Substitution",
          score: 3,
          issue: "Methods throw checked exceptions - may violate LSP",
          suggestion: "Ensure subclasses don't throw exceptions that base classes don't"
        });
      }
    }

    if (issues.length === 0) {
      return { principle: "Liskov Substitution", score: 5, issues: [] };
    }
    return { principle: "Liskov Substitution", score: issues[0].score || 5, issues };
  },

  // Interface Segregation Principle
  isp: (classInfo, content) => {
    const issues = [];

    // Too many methods in interface
    if (classInfo.isInterface && classInfo.methods.length > 10) {
      issues.push({
        principle: "Interface Segregation",
        score: 2,
        issue: `Interface has ${classInfo.methods.length} methods - too fat`,
        suggestion: "Split Interface: Break into focused, client-specific interfaces"
      });
    }

    // Class implements many interfaces
    if (classInfo.interfaces.length > 5) {
      issues.push({
        principle: "Interface Segregation",
        score: 3,
        issue: `Class implements ${classInfo.interfaces.length} interfaces`,
        suggestion: "Review if class is being forced to depend on methods it doesn't use"
      });
    }

    if (issues.length === 0) {
      return { principle: "Interface Segregation", score: 5, issues: [] };
    }
    return { principle: "Interface Segregation", score: issues[0].score, issues };
  },

  // Dependency Inversion Principle
  dip: (classInfo, content) => {
    const issues = [];

    // Direct instantiation of concrete classes
    const newMatches = content.match(/new\s+[A-Z]\w+\(/g) || [];
    if (newMatches.length > 5) {
      issues.push({
        principle: "Dependency Inversion",
        score: 2,
        issue: `Found ${newMatches.length} 'new' keywords - tight coupling to concrete classes`,
        suggestion: "Depend on Abstractions: Use interfaces and dependency injection"
      });
    }

    // Field injection (should use constructor injection)
    const hasFieldInjection = classInfo.annotations.includes('Autowired');
    if (hasFieldInjection) {
      issues.push({
        principle: "Dependency Inversion",
        score: 3,
        issue: "Using field injection instead of constructor injection",
        suggestion: "Use Constructor Injection: Makes dependencies explicit and enables immutability"
      });
    }

    // Static dependencies
    const staticCalls = (content.match(/\w+\.\w+\(/g) || []).filter(c =>
      c.startsWith('Arrays.') || c.startsWith('Collections.') || c.startsWith('System.')
    );
    // Allow some static utilities but flag excessive use

    if (issues.length === 0) {
      return { principle: "Dependency Inversion", score: 5, issues: [] };
    }
    return { principle: "Dependency Inversion", score: issues[0].score, issues };
  }
};

function countLOC(content) {
  const lines = content.split('\n');
  let loc = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('/*')) {
      inBlockComment = true;
      if (trimmed.endsWith('*/')) inBlockComment = false;
      continue;
    }
    if (inBlockComment) {
      if (trimmed.endsWith('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed === '' || trimmed.startsWith('*')) {
      continue;
    }
    loc++;
  }
  return loc;
}

/**
 * Layer Analysis
 */

function analyzeLayer(classInfo, content) {
  const layer = {
    name: classInfo.className,
    type: null,
    issues: [],
    score: 5
  };

  const annotations = classInfo.annotations.join(' ');
  const imports = classInfo.imports.join(' ');

  // Determine layer
  if (annotations.includes('RestController') || annotations.includes('Controller')) {
    layer.type = 'Presentation';
    layer.issues = checkPresentationLayer(classInfo, content);
  } else if (annotations.includes('Service')) {
    layer.type = 'Business';
    layer.issues = checkBusinessLayer(classInfo, content);
  } else if (annotations.includes('Repository') || annotations.includes('Dao')) {
    layer.type = 'Persistence';
    layer.issues = checkPersistenceLayer(classInfo, content);
  } else if (annotations.includes('Component') || annotations.includes('Configuration')) {
    layer.type = 'Infrastructure';
  }

  // Calculate score
  if (layer.issues.length > 0) {
    layer.score = Math.max(1, 5 - layer.issues.length);
  }

  return layer;
}

function checkPresentationLayer(classInfo, content) {
  const issues = [];

  // Business logic in controller
  const methodCount = classInfo.methods.length;
  const avgMethodLines = countLOC(content) / (methodCount || 1);
  if (avgMethodLines > 20) {
    issues.push({
      type: 'Layer Violation',
      issue: 'Controller methods are too long - likely contains business logic',
      suggestion: 'Move business logic to service layer'
    });
  }

  // Database access in controller
  const hasDbAccess = content.includes('EntityManager') || content.includes('JdbcTemplate');
  if (hasDbAccess) {
    issues.push({
      type: 'Layer Violation',
      issue: 'Controller directly accessing database',
      suggestion: 'Use repository pattern through service layer'
    });
  }

  // Missing DTO
  const hasEntityImport = classInfo.imports.some(i => i.includes('.entity.') || i.includes('.model.'));
  if (hasEntityImport) {
    issues.push({
      type: 'Abstraction Leak',
      issue: 'Controller may be exposing entities directly',
      suggestion: 'Use DTOs to decouple internal models from API contracts'
    });
  }

  return issues;
}

function checkBusinessLayer(classInfo, content) {
  const issues = [];

  // Direct database access
  const hasEntityManager = content.includes('EntityManager') || content.includes('Session');
  if (hasEntityManager && !content.includes('Repository')) {
    issues.push({
      type: 'Abstraction Leak',
      issue: 'Service using EntityManager directly instead of Repository',
      suggestion: 'Use Repository pattern for better testability'
    });
  }

  // Missing @Transactional
  const hasTransactional = classInfo.annotations.includes('Transactional');
  const hasDbOperation = content.includes('save') || content.includes('delete') || content.includes('update');
  if (hasDbOperation && !hasTransactional) {
    issues.push({
      type: 'Transaction Boundary',
      issue: 'Database operations without @Transactional',
      suggestion: 'Add @Transactional for proper transaction management'
    });
  }

  return issues;
}

function checkPersistenceLayer(classInfo, content) {
  const issues = [];

  // Business logic in repository
  const methodLines = countLOC(content) / (classInfo.methods.length || 1);
  if (methodLines > 15) {
    issues.push({
      type: 'Layer Violation',
      issue: 'Repository methods are complex - may contain business logic',
      suggestion: 'Move business logic to service layer'
    });
  }

  // Native queries
  const nativeQueryCount = (content.match(/@Query\s*\(\s*nativeQuery\s*=\s*true/g) || []).length;
  if (nativeQueryCount > 2) {
    issues.push({
      type: 'Database Coupling',
      issue: `Found ${nativeQueryCount} native queries - tight database coupling`,
      suggestion: 'Use JPA projections or consider database abstraction'
    });
  }

  return issues;
}

/**
 * Main Architecture Review
 */

async function review(targetPath, scope = "full") {
  log(`Running architecture review...`);
  log(`Target: ${targetPath}`);
  log(`Scope: ${scope}\n`);

  const javaFiles = findJavaFiles(targetPath);
  success(`Found ${javaFiles.length} Java files\n`);

  const layers = { Presentation: [], Business: [], Persistence: [], Infrastructure: [], Unknown: [] };
  const solidScores = { srp: [], ocp: [], lsp: [], isp: [], dip: [] };
  const designPatterns = [];
  const antiPatterns = [];

  // Analyze each file
  for (const file of javaFiles) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const classInfo = parseClassInfo(content);

      if (!classInfo.className) continue;

      // Layer analysis
      const layer = analyzeLayer(classInfo, content);
      if (layer.type) {
        layers[layer.type].push(layer);
      } else {
        layers.Unknown.push({ name: classInfo.className, type: 'Unknown' });
      }

      // SOLID analysis
      for (const [principle, checker] of Object.entries(solidChecks)) {
        const result = checker(classInfo, content);
        solidScores[principle].push(result.score);
      }

      // Pattern detection (simple)
      if (content.includes('interface') && content.includes('implements')) {
        designPatterns.push({ type: 'Strategy', location: classInfo.className });
      }
      if (content.includes('abstract class') && content.includes('extends')) {
        designPatterns.push({ type: 'Template Method', location: classInfo.className });
      }
      if (content.includes('Builder') || content.includes('.build()')) {
        designPatterns.push({ type: 'Builder', location: classInfo.className });
      }

    } catch (e) {
      warn(`Skipping ${file}: ${e.message}`);
    }
  }

  // Calculate average scores
  const avgScores = {};
  for (const [key, scores] of Object.entries(solidScores)) {
    if (scores.length > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      avgScores[key] = (sum / scores.length).toFixed(1);
    }
  }

  // Generate report
  generateArchitectureReport(targetPath, javaFiles.length, layers, avgScores, designPatterns, scope);

  success(`Architecture review complete!\n`);

  return {
    targetPath,
    scope,
    layers,
    solidScores: avgScores,
    designPatterns: designPatterns.length
  };
}

function generateArchitectureReport(targetPath, fileCount, layers, solidScores, patterns, scope) {
  console.log("\n" + "=".repeat(60));
  console.log("  🏗️  Java Architecture Review Report");
  console.log("=".repeat(60) + "\n");

  console.log(`**Target**: ${targetPath}`);
  console.log(`**Files**: ${fileCount}`);
  console.log(`**Scope**: ${scope}\n`);

  // SOLID Scores
  console.log("## SOLID Principles Assessment\n");
  const principleNames = {
    srp: 'Single Responsibility',
    ocp: 'Open/Closed',
    lsp: 'Liskov Substitution',
    isp: 'Interface Segregation',
    dip: 'Dependency Inversion'
  };

  for (const [key, name] of Object.entries(principleNames)) {
    const score = solidScores[key] || 'N/A';
    const displayScore = typeof score === 'number' ? score.toFixed(1) : score;
    const bar = typeof score === 'number' ? '█'.repeat(Math.round(score)) : '░' * 5;
    console.log(`**${name}** (${displayScore}/5) ${bar}`);
  }

  // Layer Analysis
  console.log("\n## Layer Analysis\n");
  for (const [layerName, classes] of Object.entries(layers)) {
    if (classes.length === 0) continue;
    const avgScore = classes.reduce((a, b) => a + (b.score || 3), 0) / classes.length;
    console.log(`### ${layerName} (${classes.length} classes) - Score: ${avgScore.toFixed(1)}/5`);

    // Show issues
    const issues = classes.flatMap(c => c.issues || []);
    if (issues.length > 0) {
      for (const issue of issues.slice(0, 3)) {
        console.log(`  - ⚠️  ${issue.type}: ${issue.suggestion}`);
      }
    } else {
      console.log(`  ✓ No issues found`);
    }
    console.log();
  }

  // Design Patterns
  if (patterns.length > 0) {
    console.log(`## Design Patterns Detected (${patterns.length})\n`);
    const patternCounts = {};
    for (const p of patterns) {
      patternCounts[p.type] = (patternCounts[p.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(patternCounts)) {
      console.log(`  - ${type}: ${count} occurrence(s)`);
    }
    console.log();
  }

  console.log("=".repeat(60) + "\n");

  // Save detailed report
  const reportPath = path.join(process.cwd(), "java-architect-report.md");
  const detailedReport = generateDetailedReport(targetPath, fileCount, layers, solidScores, patterns);
  fs.writeFileSync(reportPath, detailedReport);
  console.error(`✓ Report saved to: ${reportPath}\n`);
}

function generateDetailedReport(targetPath, fileCount, layers, solidScores, patterns) {
  const lines = [];
  lines.push("# Java Architecture Review Report\n");
  lines.push(`**Target**: ${targetPath}\n`);
  lines.push(`**Files Analyzed**: ${fileCount}\n`);
  lines.push(`**Generated**: ${new Date().toISOString()}\n`);

  // SOLID
  lines.push("## SOLID Principles Assessment\n");
  const principleNames = {
    srp: 'Single Responsibility',
    ocp: 'Open/Closed',
    lsp: 'Liskov Substitution',
    isp: 'Interface Segregation',
    dip: 'Dependency Inversion'
  };
  for (const [key, name] of Object.entries(principleNames)) {
    const score = solidScores[key];
    lines.push(`### ${name} (${score || 'N/A'}/5)\n`);
  }

  // Layers
  lines.push("\n## Layer Analysis\n");
  for (const [layerName, classes] of Object.entries(layers)) {
    if (classes.length === 0) continue;
    lines.push(`### ${layerName} Layer (${classes.length} classes)\n`);
    for (const cls of classes) {
      lines.push(`#### ${cls.name}\n`);
      if (cls.issues && cls.issues.length > 0) {
        for (const issue of cls.issues) {
          lines.push(`- **${issue.type}**: ${issue.suggestion}\n`);
        }
      }
    }
  }

  return lines.join('\n');
}

// Main
(async () => {
  const targetPath = process.argv[2];
  if (!targetPath) {
    error("Usage: node review.js <target_path> [scope]");
    process.exit(1);
  }

  const scope = process.argv[3] || "full";
  await review(targetPath, scope);
})();
