#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { log, success, warn, error } from "../../../../lib/logger.js";
import { parseClassInfo, countLOC, findJavaFiles } from "../../../../lib/java-parser.js";

/**
 * Code Smell Detectors
 */

const smells = {
  // Long method - more than 50 lines
  longMethod: (method, classInfo, content) => {
    if (method.lines && method.lines > 50) {
      return {
        type: "Long Method",
        severity: "medium",
        location: `${classInfo.className}.${method.name}()`,
        line: method.line,
        description: `Method is ${method.lines} lines long (threshold: 50)`,
        suggestion: "Extract Method: Break down into smaller, named methods"
      };
    }
    return null;
  },

  // Long parameter list - more than 5 parameters
  longParameterList: (method, classInfo) => {
    if (method.parameters && method.parameters.length > 5) {
      return {
        type: "Long Parameter List",
        severity: "medium",
        location: `${classInfo.className}.${method.name}()`,
        line: method.line,
        description: `Method has ${method.parameters.length} parameters (threshold: 5)`,
        suggestion: "Introduce Parameter Object: Group related parameters into a cohesive object"
      };
    }
    return null;
  },

  // God class - more than 500 lines
  godClass: (classInfo, content) => {
    const loc = countLOC(content);
    if (loc > 500) {
      return {
        type: "God Class",
        severity: "high",
        location: classInfo.className,
        description: `Class is ${loc} lines long (threshold: 500)`,
        suggestion: "Extract Class: Split into smaller, focused classes with single responsibilities"
      };
    }
    return null;
  },

  // Feature envy - method that uses another class's data more than its own
  featureEnvy: (method, classInfo, content, allClasses) => {
    // Simple heuristic: if method has many calls to other classes
    const otherClassCalls = (content.match(/\w+\.\w+/g) || []).length;
    if (otherClassCalls > 10) {
      return {
        type: "Feature Envy",
        severity: "low",
        location: `${classInfo.className}.${method.name}()`,
        line: method.line,
        description: "Method seems more interested in other classes' data",
        suggestion: "Move Method: Consider moving this method to the class it interacts with most"
      };
    }
    return null;
  },

  // Field injection - Spring anti-pattern
  fieldInjection: (classInfo) => {
    const hasAutowired = classInfo.annotations.includes('Autowired') ||
                         classInfo.annotations.includes('Resource') ||
                         classInfo.annotations.includes('Inject');
    const hasFieldInjection = classInfo.fields.some(f => {
      // Check if field has @Autowired annotation
      return true; // Simplified - would need full AST to verify
    });

    if (hasAutowired && classInfo.fields.length > 0) {
      return {
        type: "Field Injection",
        severity: "medium",
        location: classInfo.className,
        description: "Using field injection instead of constructor injection",
        suggestion: "Refactor to constructor injection for better testability and immutability"
      };
    }
    return null;
  },

  // @Transactional on private method
  transactionalOnPrivate: (classInfo, content) => {
    for (const method of classInfo.methods) {
      // Check if method has @Transactional and is private
      const methodPattern = new RegExp(`@(Transactional).*private\\s+.*\\s+${method.name}\\s*\\(`);
      if (methodPattern.test(content)) {
        return {
          type: "AOP Proxy Issue",
          severity: "high",
          location: `${classInfo.className}.${method.name}()`,
          line: method.line,
          description: "@Transactional on private method won't work due to Spring AOP proxy",
          suggestion: "Make method public or use AspectJ instead of Spring AOP"
        };
      }
    }
    return null;
  },

  // Duplicate code (simple string-based detection)
  duplicateCode: (fileContents, currentFile, currentClass) => {
    // Find repeated patterns
    const currentContent = currentFile;
    const lines = currentContent.split('\n');
    const duplicates = [];

    for (let i = 0; i < lines.length - 5; i++) {
      const block = lines.slice(i, i + 5).join('\n');
      // Check if this block appears elsewhere
      for (const [otherFile, otherContent] of Object.entries(fileContents)) {
        if (otherFile === currentFile) continue;
        if (otherContent.includes(block)) {
          duplicates.push({
            type: "Duplicate Code",
            severity: "medium",
            location: `${currentClass}:${i + 1}`,
            description: `Code block also found in ${otherFile}`,
            suggestion: "Extract Method: Create a shared method in a utility class"
          });
        }
      }
    }
    return duplicates.length > 0 ? duplicates[0] : null;
  },

  // Magic numbers/strings
  magicNumbers: (classInfo, content) => {
    const magicPattern = /\b(?!0|1|2|10|100|1000)\d{2,}\b/g;
    const matches = content.match(magicPattern);
    if (matches && matches.length > 3) {
      return {
        type: "Magic Numbers",
        severity: "low",
        location: classInfo.className,
        description: `Found ${matches.length} magic numbers in code`,
        suggestion: "Replace Magic Number with Named Constant: Use constants with meaningful names"
      };
    }
    return null;
  },

  // Divergent change - class that changes for many reasons
  divergentChange: (classInfo) => {
    // Heuristic: class with many methods in different functional areas
    if (classInfo.methods.length > 20) {
      return {
        type: "Divergent Change",
        severity: "medium",
        location: classInfo.className,
        description: `Class has ${classInfo.methods.length} methods - may have too many responsibilities`,
        suggestion: "Extract Class: Split into classes that change for different reasons"
      };
    }
    return null;
  },

  // Shotgun surgery - single change requires modifying many classes
  shotgunSurgery: (allClassInfo) => {
    // Heuristic: if many small classes are closely related
    const smallClasses = Object.values(allClassInfo).filter(c => c.methods.length < 3 && c.methods.length > 0);
    if (smallClasses.length > 5) {
      return {
        type: "Shotgun Surgery Risk",
        severity: "low",
        location: "Multiple classes",
        description: `Found ${smallClasses.length} small classes - changes may require touching many files`,
        suggestion: "Consider consolidating related functionality"
      };
    }
    return null;
  }
};

/**
 * Run refactoring analysis
 */
async function analyze(targetPath) {
  log(`Analyzing Spring code for refactoring opportunities...`);
  log(`Target: ${targetPath}\n`);

  const javaFiles = findJavaFiles(targetPath);
  success(`Found ${javaFiles.length} Java files\n`);

  const opportunities = [];
  const fileContents = {};

  // First pass: read all files
  for (const file of javaFiles) {
    try {
      fileContents[file] = fs.readFileSync(file, "utf-8");
    } catch (e) {
      warn(`Skipping ${file}: ${e.message}`);
    }
  }

  const allClassInfo = {};

  // Second pass: analyze each file
  for (const file of javaFiles) {
    const content = fileContents[file];
    const classInfo = parseClassInfo(content);

    if (!classInfo.className) {
      continue; // Skip if no class found
    }

    allClassInfo[file] = classInfo;

    // Run all smell detectors
    const smellKeys = Object.keys(smells);

    for (const smellKey of smellKeys) {
      try {
        const result = smells[smellKey](classInfo, content, fileContents, allClassInfo);
        if (result) {
          if (Array.isArray(result)) {
            opportunities.push(...result);
          } else {
            opportunities.push(result);
          }
        }
      } catch (e) {
        // Skip errors in smell detection
      }
    }
  }

  // Check for cross-file issues
  const crossFileResult = smells.shotgunSurgery(allClassInfo);
  if (crossFileResult) {
    opportunities.push(crossFileResult);
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  opportunities.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Generate report
  console.log("# Refactoring Analysis Report\n");
  console.log(`**Target**: ${targetPath}`);
  console.log(`**Files Analyzed**: ${javaFiles.length}`);
  console.log(`**Opportunities Found**: ${opportunities.length}\n`);

  // Group by severity
  const bySeverity = { high: [], medium: [], low: [] };
  for (const opp of opportunities) {
    bySeverity[opp.severity].push(opp);
  }

  // High severity
  if (bySeverity.high.length > 0) {
    console.log("## 🔴 High Priority\n");
    for (const opp of bySeverity.high) {
      console.log(`### ${opp.type}`);
      console.log(`**Location**: ${opp.location}${opp.line ? `:${opp.line}` : ''}`);
      console.log(`**Issue**: ${opp.description}`);
      console.log(`**Suggestion**: ${opp.suggestion}\n`);
    }
  }

  // Medium severity
  if (bySeverity.medium.length > 0) {
    console.log("## 🟡 Medium Priority\n");
    for (const opp of bySeverity.medium) {
      console.log(`### ${opp.type}`);
      console.log(`**Location**: ${opp.location}${opp.line ? `:${opp.line}` : ''}`);
      console.log(`**Issue**: ${opp.description}`);
      console.log(`**Suggestion**: ${opp.suggestion}\n`);
    }
  }

  // Low severity
  if (bySeverity.low.length > 0) {
    console.log("## 🟢 Low Priority\n");
    for (const opp of bySeverity.low) {
      console.log(`### ${opp.type}`);
      console.log(`**Location**: ${opp.location}${opp.line ? `:${opp.line}` : ''}`);
      console.log(`**Issue**: ${opp.description}`);
      console.log(`**Suggestion**: ${opp.suggestion}\n`);
    }
  }

  success(`Analysis complete! ${opportunities.length} refactoring opportunities found.\n`);

  // Save report
  const reportPath = path.join(process.cwd(), "spring-refactor-report.md");
  const report = generateMarkdownReport(targetPath, javaFiles.length, opportunities);
  fs.writeFileSync(reportPath, report);
  console.error(`✓ Report saved to: ${reportPath}\n`);

  return {
    targetPath,
    filesAnalyzed: javaFiles.length,
    opportunities,
    summary: {
      high: bySeverity.high.length,
      medium: bySeverity.medium.length,
      low: bySeverity.low.length
    }
  };
}

function generateMarkdownReport(targetPath, fileCount, opportunities) {
  const lines = [];
  lines.push("# Spring Refactoring Analysis Report\n");
  lines.push(`**Target**: ${targetPath}\n`);
  lines.push(`**Files Analyzed**: ${fileCount}\n`);
  lines.push(`**Opportunities Found**: ${opportunities.length}\n`);

  const bySeverity = { high: [], medium: [], low: [] };
  for (const opp of opportunities) {
    bySeverity[opp.severity].push(opp);
  }

  if (bySeverity.high.length > 0) {
    lines.push("## 🔴 High Priority\n");
    for (const opp of bySeverity.high) {
      lines.push(`### ${opp.type}`);
      lines.push(`**Location**: ${opp.location}${opp.line ? `:${opp.line}` : ''}`);
      lines.push(`**Issue**: ${opp.description}`);
      lines.push(`**Suggestion**: ${opp.suggestion}\n`);
    }
  }

  if (bySeverity.medium.length > 0) {
    lines.push("## 🟡 Medium Priority\n");
    for (const opp of bySeverity.medium) {
      lines.push(`### ${opp.type}`);
      lines.push(`**Location**: ${opp.location}${opp.line ? `:${opp.line}` : ''}`);
      lines.push(`**Issue**: ${opp.description}`);
      lines.push(`**Suggestion**: ${opp.suggestion}\n`);
    }
  }

  if (bySeverity.low.length > 0) {
    lines.push("## 🟢 Low Priority\n");
    for (const opp of bySeverity.low) {
      lines.push(`### ${opp.type}`);
      lines.push(`**Location**: ${opp.location}${opp.line ? `:${opp.line}` : ''}`);
      lines.push(`**Issue**: ${opp.description}`);
      lines.push(`**Suggestion**: ${opp.suggestion}\n`);
    }
  }

  return lines.join('\n');
}

// Main
(async () => {
  const targetPath = process.argv[2];
  if (!targetPath) {
    error("Usage: node analyze.js <target_path>");
    process.exit(1);
  }

  await analyze(targetPath);
})();
