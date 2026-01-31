/**
 * Enhanced Java Parser
 * Improved Java code analysis with better tokenization and parsing
 */

import fs from "fs";

/**
 * Token types for Java code
 */
const TokenTypes = {
  ANNOTATION: "ANNOTATION",
  KEYWORD: "KEYWORD",
  IDENTIFIER: "IDENTIFIER",
  STRING: "STRING",
  NUMBER: "NUMBER",
  OPERATOR: "OPERATOR",
  SEPARATOR: "SEPARATOR",
  COMMENT: "COMMENT",
  WHITESPACE: "WHITESPACE",
  UNKNOWN: "UNKNOWN"
};

/**
 * Simple Java tokenizer
 */
function tokenize(content) {
  const tokens = [];
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      let ws = "";
      while (i < content.length && /\s/.test(content[i])) {
        ws += content[i++];
      }
      tokens.push({ type: TokenTypes.WHITESPACE, value: ws });
      continue;
    }

    // Comments
    if (char === "/" && content[i + 1] === "/") {
      let comment = "";
      while (i < content.length && content[i] !== "\n") {
        comment += content[i++];
      }
      tokens.push({ type: TokenTypes.COMMENT, value: comment });
      continue;
    }

    if (char === "/" && content[i + 1] === "*") {
      let comment = "";
      while (i < content.length) {
        comment += content[i++];
        if (content[i - 1] === "*" && content[i] === "/") {
          comment += content[i++];
          break;
        }
      }
      tokens.push({ type: TokenTypes.COMMENT, value: comment });
      continue;
    }

    // String literals
    if (char === '"') {
      let str = '"';
      i++;
      while (i < content.length && content[i] !== '"') {
        if (content[i] === "\\") {
          str += content[i++]; // Escape
        }
        str += content[i++];
      }
      str += content[i++]; // Closing quote
      tokens.push({ type: TokenTypes.STRING, value: str });
      continue;
    }

    // Char literals
    if (char === "'") {
      let ch = "'";
      i++;
      while (i < content.length && content[i] !== "'") {
        if (content[i] === "\\") {
          ch += content[i++];
        }
        ch += content[i++];
      }
      ch += content[i++];
      tokens.push({ type: TokenTypes.STRING, value: ch });
      continue;
    }

    // Numbers
    if (/[0-9.]/.test(char)) {
      let num = "";
      while (i < content.length && /[0-9.]/.test(content[i])) {
        num += content[i++];
      }
      tokens.push({ type: TokenTypes.NUMBER, value: num });
      continue;
    }

    // Annotations
    if (char === "@") {
      let annotation = "";
      while (i < content.length && /[a-zA-Z0-9_.()]/.test(content[i])) {
        annotation += content[i++];
      }
      tokens.push({ type: TokenTypes.ANNOTATION, value: annotation });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      let id = "";
      while (i < content.length && /[a-zA-Z0-9_]/.test(content[i])) {
        id += content[i++];
      }

      // Check if keyword
      const keywords = [
        "abstract", "assert", "boolean", "break", "byte", "case", "catch",
        "char", "class", "const", "continue", "default", "do", "double",
        "else", "enum", "extends", "final", "finally", "float", "for",
        "goto", "if", "implements", "import", "instanceof", "int",
        "interface", "long", "native", "new", "package", "private",
        "protected", "public", "return", "short", "static", "strictfp",
        "super", "switch", "synchronized", "this", "throw", "throws",
        "transient", "try", "void", "volatile", "while", "true", "false",
        "null", "var"
      ];

      if (keywords.includes(id)) {
        tokens.push({ type: TokenTypes.KEYWORD, value: id });
      } else {
        tokens.push({ type: TokenTypes.IDENTIFIER, value: id });
      }
      continue;
    }

    // Operators and separators
    if ("+-*/%&|^~!<>=").includes(char)) {
      let op = char;
      i++;
      if ("+-*/%&|^<>=".includes(content[i])) {
        op += content[i++];
      }
      tokens.push({ type: TokenTypes.OPERATOR, value: op });
      continue;
    }

    // Separators
    if ("(){}[];,.:".includes(char)) {
      tokens.push({ type: TokenTypes.SEPARATOR, value: char });
      i++;
      continue;
    }

    // Unknown
    tokens.push({ type: TokenTypes.UNKNOWN, value: char });
    i++;
  }

  return tokens;
}

/**
 * Enhanced Java class parser with better accuracy
 */
export function parseClassInfoEnhanced(content) {
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
    isEnum: false,
    modifiers: []
  };

  const tokens = tokenize(content);

  // Parse package
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === TokenTypes.KEYWORD && token.value === "package") {
      i++; // skip 'package'
      let pkg = "";
      while (i < tokens.length && tokens[i].value !== ";") {
        pkg += tokens[i++].value;
        if (tokens[i] && tokens[i].value === ".") {
          pkg += tokens[i++].value;
        }
      }
      classInfo.packageName = pkg;
      i++; // skip ';'
      break;
    }
    i++;
  }

  // Parse imports
  i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === TokenTypes.KEYWORD && token.value === "import") {
      i++; // skip 'import'
      let imp = "";
      let isStatic = false;

      // Check for static import
      if (tokens[i] && tokens[i].value === "static") {
        isStatic = true;
        i++;
      }

      while (i < tokens.length && tokens[i].value !== ";") {
        imp += tokens[i++].value;
        if (tokens[i] && tokens[i].value === ".") {
          imp += tokens[i++].value;
        }
      }
      classInfo.imports.push(imp);
      i++; // skip ';'
      continue;
    }
    i++;
  }

  // Parse class/interface/enum declaration
  i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // Look for class/interface/enum keyword
    if (token.type === TokenTypes.KEYWORD) {
      if (token.value === "class" || token.value === "interface" || token.value === "enum") {
        classInfo.isInterface = token.value === "interface";
        classInfo.isEnum = token.value === "enum";

        // Get class name (next identifier)
        i++;
        while (i < tokens.length && tokens[i].type !== TokenTypes.IDENTIFIER) {
          i++; // Skip modifiers, annotations, etc.
        }
        if (i < tokens.length) {
          classInfo.className = tokens[i].value;
        }

        // Check for extends
        i++;
        while (i < tokens.length) {
          const t = tokens[i];
          if (!t) break;

          if (t.type === TokenTypes.KEYWORD && t.value === "extends") {
            i++;
            if (i < tokens.length && tokens[i].type === TokenTypes.IDENTIFIER) {
              classInfo.extendsClass = tokens[i].value;
            }
          } else if (t.type === TokenTypes.KEYWORD && t.value === "implements") {
            i++;
            let interfaces = [];
            while (i < tokens.length && tokens[i].value !== "{") {
              if (tokens[i].type === TokenTypes.IDENTIFIER) {
                interfaces.push(tokens[i].value);
              }
              i++;
              if (tokens[i] && tokens[i].value === ",") i++;
            }
            classInfo.interfaces = interfaces;
          } else if (t.value === "{") {
            break;
          }
          i++;
        }
        break;
      }
    }
    i++;
  }

  // Parse methods and fields
  i = 0;
  let lineNumber = 1;
  let braceLevel = 0;
  let inClassBody = false;
  let currentMethod = null;
  let inMethod = false;

  // First, build a map of line numbers by counting newlines
  const lineMap = buildLineMap(content);

  while (i < tokens.length) {
    const token = tokens[i];

    // Track brace level
    if (token.value === "{") braceLevel++;
    if (token.value === "}") {
      braceLevel--;
      if (inMethod && braceLevel === 1) { // End of method
        if (currentMethod) {
          currentMethod.endLine = lineNumber;
          classInfo.methods.push(currentMethod);
        }
        inMethod = false;
        currentMethod = null;
      }
    }

    // Track line numbers
    if (token.value && token.value.includes("\n")) {
      lineNumber += token.value.split("\n").length - 1;
    }

    // Collect annotations
    if (token.type === TokenTypes.ANNOTATION) {
      const annotationName = token.value.replace("@", "").replace(/[()]/g, "");
      classInfo.annotations.push(annotationName);
    }

    // Detect method declarations
    if (braceLevel === 1 && !inMethod) {
      // Look for method pattern: modifiers return_type name(params) throws...
      if (token.type === TokenTypes.IDENTIFIER || token.type === TokenTypes.KEYWORD) {
        // Check if this could be a method name
        const next = tokens[i + 1];
        const nextNext = tokens[i + 2];

        if (next && next.value === "(") {
          // Found a method!
          const methodName = token.value;

          // Count parameters
          let paramCount = 0;
          let j = i + 2;
          while (j < tokens.length && tokens[j].value !== ")") {
            if (tokens[j].value === ",") paramCount++;
            j++;
          }

          currentMethod = {
            name: methodName,
            parameters: [],
            line: findLineNumber(lineMap, i),
            modifiers: []
          };

          inMethod = true;
        }
      }
    }

    // Detect fields (simplistic - any identifier followed by identifier and ;)
    if (braceLevel === 1 && !inMethod) {
      const next = tokens[i + 1];
      const nextNext = tokens[i + 2];

      if (token.type === TokenTypes.IDENTIFIER &&
          next && next.type === TokenTypes.IDENTIFIER &&
          nextNext && nextNext.value === ";") {
        classInfo.fields.push({
          name: next.value,
          line: findLineNumber(lineMap, i)
        });
      }
    }

    i++;
  }

  return classInfo;
}

/**
 * Build a map of token positions to line numbers
 */
function buildLineMap(content) {
  const lines = content.split("\n");
  const map = new Map();
  let pos = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const lineLength = lines[lineNum].length + 1; // +1 for newline
    for (let j = 0; j < lineLength; j++) {
      map.set(pos + j, lineNum + 1);
    }
    pos += lineLength;
  }

  return map;
}

/**
 * Find line number for token position
 */
function findLineNumber(lineMap, tokenIndex) {
  // This is approximate - for accurate line tracking,
  // we'd need to track position during tokenization
  return lineMap.get(0) || 1;
}

/**
 * Count lines of code (excluding comments and blank lines)
 */
export function countLOC(content) {
  const lines = content.split("\n");
  let loc = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for block comment start
    if (trimmed.startsWith("/*")) {
      inBlockComment = true;
      if (!trimmed.endsWith("*/") && !trimmed.includes("*/")) {
        continue;
      }
    }

    // Check for block comment end
    if (inBlockComment) {
      if (trimmed.endsWith("*/") || trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    // Skip empty lines, comments, and single-line comments
    if (trimmed === "" ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")) {
      continue;
    }

    loc++;
  }

  return loc;
}

/**
 * Extract methods with improved accuracy
 */
export function extractMethodsEnhanced(content) {
  const methods = [];
  const regex = /(?:@.*?)?\s*(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*(?:synchronized)?\s*(?:[\w<>[\],\s]*)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,.\s]+)?\s*\{/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const methodName = match[1];
    const paramsStr = match[2];
    const startPos = match.index;

    // Count parameters
    const params = paramsStr ? paramsStr.split(",").filter(p => p.trim()).length : 0;

    // Find line number
    const before = content.substring(0, startPos);
    const line = before.split("\n").length;

    methods.push({
      name: methodName,
      parameters: new Array(Math.max(0, params)).fill(""),
      line
    });
  }

  return methods;
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
        // Skip common non-source directories
        if (!['node_modules', '.git', 'target', 'build', '.idea', '.mvn', 'gradle', 'out', 'dist'].includes(entry.name)) {
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
