#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { log, success, warn, error } from "../../../../lib/logger.js";
import { parseClassInfo, countLOC, findJavaFiles } from "../../../../lib/java-parser.js";
import { loadConfig } from "../../../../lib/config.js";
import { createCache, CacheKeys } from "../../../../lib/cache.js";
import { safeExecute, validateDirectory, AnalysisError } from "../../../../lib/errors.js";
import { generateReport, saveReport, generateReportName } from "../../../../lib/report-generator.js";

/**
 * Code Smell Detectors with configurable thresholds
 */

function createSmellsDetectors(config) {
  const thresholds = config?.refactor || {};

  return {
    // Long method - configurable threshold
    longMethod: (method, classInfo, content) => {
      const threshold = thresholds.longMethodLines || 50;
      if (method.lines && method.lines > threshold) {
        return {
          type: "Long Method",
          severity: method.lines > threshold * 2 ? "high" : "medium",
          location: `${classInfo.className}.${method.name}()`,
          line: method.line,
          description: `Method is ${method.lines} lines long (threshold: ${threshold})`,
          suggestion: "Extract Method: Break down into smaller, named methods"
        };
      }
      return null;
    },

    // Long parameter list - configurable threshold
    longParameterList: (method, classInfo) => {
      const threshold = thresholds.longParameterCount || 5;
      if (method.parameters && method.parameters.length > threshold) {
        return {
          type: "Long Parameter List",
          severity: method.parameters.length > threshold * 2 ? "high" : "medium",
          location: `${classInfo.className}.${method.name}()`,
          line: method.line,
          description: `Method has ${method.parameters.length} parameters (threshold: ${threshold})`,
          suggestion: "Introduce Parameter Object: Group related parameters into a cohesive object"
        };
      }
      return null;
    },

    // God class - configurable threshold
    godClass: (classInfo, content) => {
      const threshold = thresholds.godClassLines || 500;
      const loc = countLOC(content);
      if (loc > threshold) {
        return {
          type: "God Class",
          severity: loc > threshold * 2 ? "high" : "medium",
          location: classInfo.className,
          description: `Class is ${loc} lines long (threshold: ${threshold})`,
          suggestion: "Extract Class: Split into smaller, focused classes with single responsibilities"
        };
      }
      return null;
    },

    // Feature envy - method that uses another class's data more than its own
    featureEnvy: (method, classInfo, content, allClasses) => {
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
      const currentContent = currentFile;
      const lines = currentContent.split('\n');
      const duplicates = [];

      for (let i = 0; i < lines.length - 5; i++) {
        const block = lines.slice(i, i + 5).join('\n');
        for (const [otherFile, otherContent] of Object.entries(fileContents)) {
          if (otherFile === currentFile) continue;
          if (otherContent.includes(block)) {
            duplicates.push({
              type: "Duplicate Code",
              severity: "medium",
              location: `${currentClass}:${i + 1}`,
              description: `Code block also found in ${path.basename(otherFile)}`,
              suggestion: "Extract Method: Create a shared method in a utility class"
            });
            break; // Only report once per block
          }
        }
        if (duplicates.length >= 5) break; // Limit duplicates reported
      }
      return duplicates.length > 0 ? duplicates[0] : null;
    },

    // Magic numbers/strings
    magicNumbers: (classInfo, content) => {
      const threshold = thresholds.magicNumberThreshold || 3;
      const magicPattern = /\b(?!0|1|2|10|100|1000)\d{2,}\b/g;
      const matches = content.match(magicPattern);
      if (matches && matches.length > threshold) {
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
      const threshold = thresholds.manyMethodsCount || 20;
      if (classInfo.methods.length > threshold) {
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
}

/**
 * Run refactoring analysis with improved error handling
 */
async function analyze(targetPath, options = {}) {
  try {
    // Validate target path
    await validateDirectory(targetPath);

    // Load configuration
    const config = loadConfig(targetPath);

    // Initialize cache
    const cache = createCache(config);
    const cacheKey = CacheKeys.refactorAnalysis(targetPath);

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      log("Using cached analysis results");
      console.log(JSON.stringify(cached, null, 2));
      return cached;
    }

    log(`Analyzing Spring code for refactoring opportunities...`);
    log(`Target: ${targetPath}\n`);

    const javaFiles = findJavaFiles(targetPath);
    success(`Found ${javaFiles.length} Java files\n`);

    const opportunities = [];
    const fileContents = {};

    // Filter files based on config
    const excludePatterns = config?.analysis?.excludeFiles || [];
    const filteredFiles = javaFiles.filter(file => {
      return !excludePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace("*", ".*"));
        return regex.test(path.basename(file));
      });
    });

    log(`Analyzing ${filteredFiles.length} files (excluded ${javaFiles.length - filteredFiles.length} test files)\n`);

    // First pass: read all files
    for (const file of filteredFiles) {
      await safeExecute(
        () => {
          fileContents[file] = fs.readFileSync(file, "utf-8");
          return true;
        },
        { filePath: file }
      );
    }

    const allClassInfo = {};
    const smells = createSmellsDetectors(config);

    // Second pass: analyze each file
    for (const file of filteredFiles) {
      const content = fileContents[file];
      if (!content) continue;

      await safeExecute(
        () => {
          const classInfo = parseClassInfo(content);

          if (!classInfo.className) {
            return null;
          }

          allClassInfo[file] = classInfo;

          // Run all smell detectors
          for (const [smellKey, detector] of Object.entries(smells)) {
            const result = detector(classInfo, content, fileContents, allClassInfo);
            if (result) {
              if (Array.isArray(result)) {
                opportunities.push(...result);
              } else {
                opportunities.push(result);
              }
            }
          }

          return true;
        },
        { filePath: file }
      );
    }

    // Check for cross-file issues
    const crossFileResult = smells.shotgunSurgery(allClassInfo);
    if (crossFileResult) {
      opportunities.push(crossFileResult);
    }

    // Sort by severity
    const severityOrder = { high: 0, medium: 1, low: 2 };
    opportunities.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const result = {
      title: "Spring Refactoring Analysis",
      targetPath,
      filesAnalyzed: filteredFiles.length,
      opportunities,
      summary: {
        high: opportunities.filter(o => o.severity === "high").length,
        medium: opportunities.filter(o => o.severity === "medium").length,
        low: opportunities.filter(o => o.severity === "low").length,
        total: opportunities.length
      }
    };

    // Cache result
    cache.set(cacheKey, result);

    // Generate and display report
    const outputFormat = options.format || config?.output?.format || "markdown";
    const reportContent = generateReport(result, {
      format: outputFormat,
      includeSnippets: config?.output?.includeSnippets !== false,
      severityFilter: options.severity || config?.output?.severityFilter || "all"
    });

    console.log(reportContent);

    // Save report if enabled
    if (config?.output?.saveReports !== false) {
      const reportName = generateReportName("refactor", outputFormat);
      const savedPath = saveReport(reportContent, reportName, outputFormat);
      console.error(`\n✓ Report saved to: ${savedPath}\n`);
    }

    success(`Analysis complete! ${opportunities.length} refactoring opportunities found.\n`);

    return result;

  } catch (err) {
    if (err instanceof AnalysisError) {
      error(err.message);
      throw err;
    }
    error(`Analysis failed: ${err.message}`);
    throw err;
  }
}

// Main
(async () => {
  const targetPath = process.argv[2];
  if (!targetPath) {
    error("Usage: node analyze.js <target_path> [--format=markdown|json|html] [--severity=all|high|medium|low]");
    process.exit(1);
  }

  const options = {
    format: process.argv.find(a => a.startsWith("--format="))?.split("=")[1],
    severity: process.argv.find(a => a.startsWith("--severity="))?.split("=")[1]
  };

  await analyze(targetPath, options);
})();
