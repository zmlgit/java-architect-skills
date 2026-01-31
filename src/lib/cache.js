/**
 * Cache Manager
 * Handles caching of analysis results, PMD downloads, and parsed files
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Generate cache key from input data
 */
function generateKey(data) {
  return crypto.createHash("md5").update(JSON.stringify(data)).digest("hex");
}

/**
 * Simple in-memory and disk-based cache
 */
class Cache {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.directory = options.directory || ".java-architect-cache";
    this.ttl = options.ttl || 86400000; // 24 hours default
    this.memoryCache = new Map();

    // Create cache directory if needed
    if (this.enabled && this.directory) {
      const cacheDir = path.resolve(this.directory);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      this.cacheDir = cacheDir;
    }
  }

  /**
   * Get cached value
   */
  get(key) {
    if (!this.enabled) return null;

    // Check memory cache first
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key);
      if (!this.isExpired(entry)) {
        return entry.value;
      } else {
        this.memoryCache.delete(key);
      }
    }

    // Check disk cache
    if (this.cacheDir) {
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      if (fs.existsSync(cacheFile)) {
        try {
          const entry = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
          if (!this.isExpired(entry)) {
            // Promote to memory cache
            this.memoryCache.set(key, entry);
            return entry.value;
          } else {
            // Clean up expired cache
            fs.unlinkSync(cacheFile);
          }
        } catch (e) {
          // Invalid cache file, ignore
        }
      }
    }

    return null;
  }

  /**
   * Set cached value
   */
  set(key, value, ttl = null) {
    if (!this.enabled) return;

    const entry = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl || this.ttl
    };

    // Store in memory
    this.memoryCache.set(key, entry);

    // Store on disk
    if (this.cacheDir) {
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      try {
        fs.writeFileSync(cacheFile, JSON.stringify(entry));
      } catch (e) {
        // Disk write failed, but memory cache is still valid
      }
    }
  }

  /**
   * Check if cache entry is expired
   */
  isExpired(entry) {
    if (!entry.timestamp) return true;
    const age = Date.now() - entry.timestamp;
    return age > (entry.ttl || this.ttl);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.memoryCache.clear();

    if (this.cacheDir && fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    }
  }

  /**
   * Clean expired entries
   */
  clean() {
    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key);
      }
    }

    // Clean disk cache
    if (this.cacheDir && fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const cacheFile = path.join(this.cacheDir, file);
          try {
            const entry = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
            if (this.isExpired(entry)) {
              fs.unlinkSync(cacheFile);
            }
          } catch (e) {
            // Invalid file, remove it
            fs.unlinkSync(cacheFile);
          }
        }
      }
    }
  }

  /**
   * Get cache stats
   */
  getStats() {
    const memorySize = this.memoryCache.size;
    let diskSize = 0;

    if (this.cacheDir && fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      diskSize = files.filter(f => f.endsWith(".json")).length;
    }

    return {
      memoryEntries: memorySize,
      diskEntries: diskSize,
      totalEntries: memorySize + diskSize,
      cacheDir: this.cacheDir
    };
  }
}

/**
 * Create a cache instance from config
 */
export function createCache(config) {
  const cacheConfig = config?.cache || {};
  return new Cache({
    enabled: cacheConfig.enabled !== false,
    directory: cacheConfig.directory,
    ttl: cacheConfig.ttl
  });
}

/**
 * Cache key generators for different types of data
 */
export const CacheKeys = {
  // File content hash
  fileContent: (filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    return generateKey({ type: "file", path: filePath, content });
  },

  // PMD analysis result
  pmdAnalysis: (targetPath, rulesPath) => {
    return generateKey({ type: "pmd", target: targetPath, rules: rulesPath });
  },

  // Parsed Java file
  parsedJava: (filePath) => {
    return generateKey({ type: "parsed", path: filePath });
  },

  // Refactor analysis
  refactorAnalysis: (targetPath) => {
    return generateKey({ type: "refactor", target: targetPath });
  },

  // Architecture review
  architectureReview: (targetPath, scope) => {
    return generateKey({ type: "arch", target: targetPath, scope });
  }
};

export { Cache };
