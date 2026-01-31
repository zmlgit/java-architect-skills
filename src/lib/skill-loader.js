/**
 * Skill metadata loader and validator.
 */

import fs from "fs";
import path from "path";

/**
 * Default skill metadata structure.
 */
const DEFAULT_SKILL_META = {
  name: "",
  version: "1.0.0",
  displayName: "",
  description: "",
  category: "",
  author: "",
  tags: [],
  tools: [],
  requirements: {
    runtime: "node",
    dependencies: [],
  },
};

/**
 * Load and validate skill.json from a skill directory.
 * @param {string} skillPath - Path to the skill directory
 * @returns {Object|null} Parsed skill metadata or null if invalid
 */
export function loadSkillMeta(skillPath) {
  const metaFile = path.join(skillPath, "skill.json");

  if (!fs.existsSync(metaFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metaFile, "utf-8");
    const meta = JSON.parse(content);

    // Validate required fields
    if (!meta.name || !meta.category) {
      throw new Error("Missing required fields: name, category");
    }

    // Merge with defaults
    return {
      ...DEFAULT_SKILL_META,
      ...meta,
      path: skillPath,
    };
  } catch (e) {
    console.error(`[MCP] Failed to load skill.json from ${skillPath}: ${e.message}`);
    return null;
  }
}

/**
 * Validate tool configuration from skill metadata.
 * @param {Object} tool - Tool configuration object
 * @returns {boolean} True if valid
 */
export function isValidTool(tool) {
  return (
    tool &&
    typeof tool.name === "string" &&
    typeof tool.description === "string" &&
    typeof tool.script === "string" &&
    tool.inputSchema &&
    typeof tool.inputSchema === "object"
  );
}

/**
 * Get the full script path for a tool.
 * @param {string} skillPath - Path to the skill directory
 * @param {string} scriptPath - Relative script path from skill.json
 * @returns {string} Absolute path to the script
 */
export function getToolScriptPath(skillPath, scriptPath) {
  // Handle both relative paths and paths starting with "scripts/"
  if (scriptPath.startsWith("/")) {
    return scriptPath; // Already absolute
  }
  return path.join(skillPath, scriptPath);
}
