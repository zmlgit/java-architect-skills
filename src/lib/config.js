/**
 * Configuration Manager
 * Loads and manages configuration from .java-architect.json files
 */

import fs from "fs";
import path from "path";

const DEFAULT_CONFIG = {
  // Refactoring thresholds
  refactor: {
    longMethodLines: 50,
    longParameterCount: 5,
    godClassLines: 500,
    manyMethodsCount: 20,
    magicNumberThreshold: 3
  },

  // Architecture thresholds
  architecture: {
    interfaceMethodLimit: 10,
    implementsInterfaceLimit: 5,
    instanceofLimit: 3,
    nativeQueryLimit: 2,
    avgMethodLines: 20
  },

  // Scoring thresholds
  scores: {
    excellent: 5,
    good: 4,
    fair: 3,
    poor: 2,
    critical: 1
  },

  // Output options
  output: {
    format: "markdown", // markdown, json, html
    includeSnippets: true,
    severityFilter: "all", // all, high, medium, low
    saveReports: true
  },

  // Caching
  cache: {
    enabled: true,
    directory: ".java-architect-cache",
    ttl: 86400000 // 24 hours
  },

  // Analysis options
  analysis: {
    ignorePatterns: [
      "node_modules",
      ".git",
      "target",
      "build",
      ".idea",
      "dist",
      "out"
    ],
    excludeFiles: [
      "*Test.java",
      "*Tests.java",
      "*Mock*.java"
    ]
  }
};

let configCache = new Map();

/**
 * Load configuration from a directory path
 * Searches for .java-architect.json in the directory and its parents
 */
export function loadConfig(startPath) {
  // Check cache first
  if (configCache.has(startPath)) {
    return configCache.get(startPath);
  }

  let config = { ...DEFAULT_CONFIG };
  let currentDir = startPath;

  // Search up the directory tree
  while (currentDir !== path.dirname(currentDir)) {
    const configPath = path.join(currentDir, ".java-architect.json");

    if (fs.existsSync(configPath)) {
      try {
        const userConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        config = mergeConfig(config, userConfig);
        break;
      } catch (e) {
        // Invalid config, use defaults
        console.warn(`Warning: Invalid config at ${configPath}, using defaults`);
      }
    }

    currentDir = path.dirname(currentDir);
  }

  configCache.set(startPath, config);
  return config;
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(base, override) {
  const result = { ...base };

  for (const key of Object.keys(override)) {
    if (typeof override[key] === "object" && !Array.isArray(override[key])) {
      result[key] = mergeConfig(base[key] || {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }

  return result;
}

/**
 * Get configuration value by path
 * Example: getConfigValue(config, "refactor.longMethodLines")
 */
export function getConfigValue(config, path) {
  const keys = path.split(".");
  let value = config;

  for (const key of keys) {
    if (value && typeof value === "object") {
      value = value[key];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Create a sample config file
 */
export function createSampleConfig(targetPath) {
  const sampleConfig = {
    $schema: "https://raw.githubusercontent.com/zmlgit/java-architect-skills/main/config-schema.json",
    refactor: {
      longMethodLines: 50,
      longParameterCount: 5,
      godClassLines: 500
    },
    architecture: {
      interfaceMethodLimit: 10
    },
    output: {
      format: "markdown",
      includeSnippets: true
    }
  };

  const configPath = path.join(targetPath, ".java-architect.json");
  fs.writeFileSync(configPath, JSON.stringify(sampleConfig, null, 2));
  return configPath;
}

/**
 * Clear configuration cache
 */
export function clearConfigCache() {
  configCache.clear();
}

export { DEFAULT_CONFIG };
