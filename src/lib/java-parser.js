/**
 * Java Code Parser Utility
 * Provides utilities for parsing and analyzing Java code
 */

import fs from "fs";

/**
 * Extract class information from Java source
 */
export function parseClassInfo(content) {
  const classInfo = {
    className: null,
    packageName: null,
    imports: [],
    annotations: [],
    fields: [],
    methods: [],
    interfaces: [],
    extendsClass: null,
    isAbstract: false,
    isInterface: false,
    isEnum: false
  };

  // Package
  const packageMatch = content.match(/package\s+([\w.]+);/);
  if (packageMatch) classInfo.packageName = packageMatch[1];

  // Imports
  const importMatches = content.matchAll(/import\s+(?:static\s+)?([\w.]+);/g);
  classInfo.imports = Array.from(importMatches).map(m => m[1]);

  // Class/Interface/Enum declaration
  const declMatch = content.match(/(?:public\s+)?(abstract\s+)?(class|interface|enum)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?/);
  if (declMatch) {
    classInfo.isAbstract = !!declMatch[1];
    classInfo.isInterface = declMatch[2] === 'interface';
    classInfo.isEnum = declMatch[2] === 'enum';
    classInfo.className = declMatch[3];
    classInfo.extendsClass = declMatch[4] || null;
    if (declMatch[5]) {
      classInfo.interfaces = declMatch[5].split(',').map(s => s.trim());
    }
  }

  // Annotations
  const annotationMatches = content.matchAll(/@(\w+)(?:\([^)]*\))?/g);
  classInfo.annotations = Array.from(annotationMatches).map(m => m[1]);

  // Methods
  const methodPattern = /(?:@.*?)?[\s]*(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*(?:abstract)?\s*(?:[\w<>[\],\s]*)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*(?:{|;)/g;
  let methodMatch;
  while ((methodMatch = methodPattern.exec(content)) !== null) {
    const params = methodMatch[2].split(',').filter(p => p.trim());
    classInfo.methods.push({
      name: methodMatch[1],
      parameters: params,
      line: content.substring(0, methodMatch.index).split('\n').length
    });
  }

  // Fields
  const fieldPattern = /(?:@.*?)?[\s]*(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*(?:[\w<>[\],\s]+)\s+(\w+)\s*(?:=|;)/g;
  let fieldMatch;
  while ((fieldMatch = fieldPattern.exec(content)) !== null) {
    classInfo.fields.push({
      name: fieldMatch[1],
      line: content.substring(0, fieldMatch.index).split('\n').length
    });
  }

  return classInfo;
}

/**
 * Count lines of code (excluding comments and blank lines)
 */
export function countLOC(content) {
  const lines = content.split('\n');
  let loc = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip block comments
    if (trimmed.startsWith('/*')) {
      inBlockComment = true;
      if (trimmed.endsWith('*/')) inBlockComment = false;
      continue;
    }
    if (inBlockComment) {
      if (trimmed.endsWith('*/')) inBlockComment = false;
      continue;
    }

    // Skip single-line comments and blank lines
    if (trimmed.startsWith('//') || trimmed === '' || trimmed.startsWith('*')) {
      continue;
    }

    loc++;
  }

  return loc;
}

/**
 * Calculate cyclomatic complexity
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
    /\?\?/g,  // ternary
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
 * Find all Java files in a directory
 */
export function findJavaFiles(targetPath) {
  const javaFiles = [];

  function scan(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'target', 'build', '.idea', '.mvn', 'gradle'].includes(entry.name)) {
          scan(fullPath);
        }
      } else if (entry.name.endsWith('.java')) {
        javaFiles.push(fullPath);
      }
    }
  }

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    return [targetPath];
  }

  scan(targetPath);
  return javaFiles;
}

import path from "path";
