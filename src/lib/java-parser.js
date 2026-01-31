/**
 * Java Code Parser Utility
 * Provides utilities for parsing and analyzing Java code
 * Uses enhanced parser with tokenization for better accuracy
 */

import fs from "fs";
import path from "path";

// Re-export from enhanced parser
export {
  parseClassInfo as parseClassInfoEnhanced,
  countLOC,
  findJavaFiles,
  extractMethodsEnhanced
} from "./java-parser-enhanced.js";

/**
 * Legacy parseClassInfo - maintained for backward compatibility
 * Uses enhanced parser internally
 */
export function parseClassInfo(content) {
  return parseClassInfoEnhanced(content);
}

/**
 * Extract methods - maintained for backward compatibility
 */
export function extractMethods(content) {
  return extractMethodsEnhanced(content);
}

/**
 * Extract package information from Java source
 */
export function extractPackage(content) {
  const match = content.match(/package\s+([\w.]+);/);
  return match ? match[1] : null;
}

/**
 * Extract class name from Java source
 */
export function extractClassName(content) {
  const match = content.match(/(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/);
  return match ? match[1] : null;
}

/**
 * Extract imports from Java source
 */
export function extractImports(content) {
  const matches = content.matchAll(/import\s+(?:static\s+)?([\w.]+);/g);
  return Array.from(matches).map(m => m[1]);
}

/**
 * Extract annotations from Java source
 */
export function extractAnnotations(content) {
  const annotations = [];
  const lines = content.split("\n");

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

/**
 * Extract Spring component types from Java source
 */
export function extractSpringComponents(content) {
  const components = [];

  if (content.includes("@RestController")) components.push("RestController");
  if (content.includes("@Controller")) components.push("Controller");
  if (content.includes("@Service")) components.push("Service");
  if (content.includes("@Repository")) components.push("Repository");
  if (content.includes("@Component")) components.push("Component");
  if (content.includes("@Configuration")) components.push("Configuration");

  return components;
}

/**
 * Extract dependencies (injected fields) from Java source
 */
export function extractDependencies(content) {
  const deps = [];
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    if (line.includes("@Autowired") || line.includes("@Resource") || line.includes("@Inject")) {
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

/**
 * Calculate cyclomatic complexity for a method
 */
export function calculateComplexity(methodCode) {
  let complexity = 1; // Base complexity

  const decisionKeywords = [
    /\bif\b/g,
    /\belse\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\?\?/g,
    /&&/g,
    /\|\|/g
  ];

  for (const keyword of decisionKeywords) {
    const matches = methodCode.match(keyword);
    if (matches) complexity += matches.length;
  }

  return complexity;
}

/**
 * Analyze Java file and return comprehensive info
 */
export function analyzeJavaFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8");

  const classInfo = parseClassInfo(content);

  if (!classInfo.className) {
    return null;
  }

  // Add Spring-specific analysis
  classInfo.springComponents = extractSpringComponents(content);
  classInfo.dependencies = extractDependencies(content);

  // Add source code reference for snippet extraction
  classInfo.sourceCode = content;

  return classInfo;
}

/**
 * Build call chain analysis for entry points
 */
export function buildCallChain(javaFiles, pmdResults = []) {
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

  // Find entry points
  const entryPoints = [];
  for (const [key, info] of fileAnalysis) {
    const hasRestMapping = info.annotations.some(a =>
      ["GetMapping", "PostMapping", "RequestMapping", "PatchMapping", "PutMapping", "DeleteMapping"].includes(a)
    );
    const isService = info.springComponents.includes("Service");
    const isComponent = info.springComponents.includes("Component");
    const hasTransactional = info.annotations.some(a => a === "Transactional");
    const hasAsync = info.annotations.some(a => a === "Async");
    const hasScheduled = info.annotations.some(a => a === "Scheduled");
    const hasJobHandler = info.annotations.some(a => a === "JobHandler");

    if (hasRestMapping ||
        (isService && (hasTransactional || hasAsync)) ||
        hasScheduled ||
        hasJobHandler ||
        (isComponent && hasAsync)) {
      entryPoints.push(info);
    }
  }

  return {
    entryPoints: entryPoints.slice(0, 5),
    fileAnalysis: Object.fromEntries(fileAnalysis),
    totalFiles: javaFiles.length
  };
}

