/**
 * MCP Configuration Handlers for various AI Agents
 *
 * Each agent exports:
 * - name: Display name
 * - detect(): Returns true if agent is installed
 * - getConfigPath(): Returns the config file path
 * - getConfig(configData): Returns the MCP config object
 * - write(config): Writes the config to disk
 */

import fs from "fs";
import path from "path";
import os from "os";

// Platform detection
const isMac = os.platform() === "darwin";
const isWindows = os.platform() === "win32";
const isLinux = os.platform() === "linux";

const home = os.homedir();

// Helper to safely read JSON
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// Helper to safely write JSON
function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// Claude Desktop
// ═══════════════════════════════════════════════════════════════════════════
export const claudeDesktop = {
  name: "Claude Desktop",
  detect: () => {
    const configPath = getClaudeDesktopConfigPath();
    return fs.existsSync(path.dirname(configPath)) || fs.existsSync(configPath);
  },
  getConfigPath: getClaudeDesktopConfigPath,
  getConfig: (data) => data.mcpServers || {},
  setConfig: (configData, serverName, serverConfig) => {
    configData.mcpServers = configData.mcpServers || {};
    configData.mcpServers[serverName] = serverConfig;
    return configData;
  },
  write: (filePath, config) => writeJSON(filePath, config),
};

function getClaudeDesktopConfigPath() {
  if (isMac) {
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  } else if (isWindows) {
    return path.join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json");
  } else {
    return path.join(home, ".config", "Claude", "claude_desktop_config.json");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Claude Code (CLI)
// ═══════════════════════════════════════════════════════════════════════════
export const claudeCode = {
  name: "Claude Code",
  detect: () => {
    // Check if claude command exists
    try {
      const { execSync } = require("child_process");
      execSync("which claude", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  getConfigPath: () => path.join(home, ".claude", "settings.json"),
  getConfig: (data) => data.mcpServers || {},
  setConfig: (configData, serverName, serverConfig) => {
    configData.mcpServers = configData.mcpServers || {};
    configData.mcpServers[serverName] = serverConfig;
    return configData;
  },
  write: (filePath, config) => writeJSON(filePath, config),
};

// ═══════════════════════════════════════════════════════════════════════════
// Cursor
// ═══════════════════════════════════════════════════════════════════════════
export const cursor = {
  name: "Cursor",
  detect: () => {
    const configPath = getCursorConfigPath();
    return fs.existsSync(path.dirname(configPath)) || fs.existsSync(configPath);
  },
  getConfigPath: getCursorConfigPath,
  getConfig: (data) => {
    // Cursor uses a different format
    if (!data.mcpServers) data.mcpServers = {};
    return data.mcpServers;
  },
  setConfig: (configData, serverName, serverConfig) => {
    configData.mcpServers = configData.mcpServers || {};
    configData.mcpServers[serverName] = serverConfig;
    return configData;
  },
  write: (filePath, config) => writeJSON(filePath, config),
};

function getCursorConfigPath() {
  if (isMac) {
    return path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "mcp-servers.json");
  } else if (isWindows) {
    return path.join(home, "AppData", "Roaming", "Cursor", "User", "globalStorage", "mcp-servers.json");
  } else {
    return path.join(home, ".config", "Cursor", "User", "globalStorage", "mcp-servers.json");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VS Code + Cline Extension
// ═══════════════════════════════════════════════════════════════════════════
export const cline = {
  name: "Cline (VS Code)",
  detect: () => {
    const configPath = getVSCodeConfigPath();
    return fs.existsSync(configPath);
  },
  getConfigPath: getVSCodeConfigPath,
  getConfig: (data) => {
    // Cline stores MCP config in settings.json
    return data["cline.mcpServers"] || {};
  },
  setConfig: (configData, serverName, serverConfig) => {
    if (!configData["cline.mcpServers"]) {
      configData["cline.mcpServers"] = {};
    }
    configData["cline.mcpServers"][serverName] = serverConfig;
    return configData;
  },
  write: (filePath, config) => writeJSON(filePath, config),
};

function getVSCodeConfigPath() {
  if (isMac) {
    return path.join(home, "Library", "Application Support", "Code", "User", "settings.json");
  } else if (isWindows) {
    return path.join(home, "AppData", "Roaming", "Code", "User", "settings.json");
  } else {
    return path.join(home, ".config", "Code", "User", "settings.json");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Windsurf (formerly Codeium)
// ═══════════════════════════════════════════════════════════════════════════
export const windsurf = {
  name: "Windsurf",
  detect: () => {
    const configPath = getWindsurfConfigPath();
    return fs.existsSync(path.dirname(configPath)) || fs.existsSync(configPath);
  },
  getConfigPath: getWindsurfConfigPath,
  getConfig: (data) => data.mcpServers || {},
  setConfig: (configData, serverName, serverConfig) => {
    configData.mcpServers = configData.mcpServers || {};
    configData.mcpServers[serverName] = serverConfig;
    return configData;
  },
  write: (filePath, config) => writeJSON(filePath, config),
};

function getWindsurfConfigPath() {
  if (isMac) {
    return path.join(home, "Library", "Application Support", "Windsurf", "mcp-config.json");
  } else if (isWindows) {
    return path.join(home, "AppData", "Roaming", "Windsurf", "mcp-config.json");
  } else {
    return path.join(home, ".config", "Windsurf", "mcp-config.json");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Continue.dev
// ═══════════════════════════════════════════════════════════════════════════
export const continueDev = {
  name: "Continue.dev",
  detect: () => {
    const configPath = getContinueConfigPath();
    return fs.existsSync(configPath);
  },
  getConfigPath: getContinueConfigPath,
  getConfig: (data) => {
    // Continue stores MCP in config.json under mcpServers key
    return data.mcpServers || {};
  },
  setConfig: (configData, serverName, serverConfig) => {
    configData.mcpServers = configData.mcpServers || {};
    configData.mcpServers[serverName] = serverConfig;
    return configData;
  },
  write: (filePath, config) => writeJSON(filePath, config),
};

function getContinueConfigPath() {
  if (isMac) {
    return path.join(home, ".continue", "config.json");
  } else if (isWindows) {
    return path.join(home, ".continue", "config.json");
  } else {
    return path.join(home, ".continue", "config.json");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Roo Code (VS Code Extension)
// ═══════════════════════════════════════════════════════════════════════════
export const rooCode = {
  name: "Roo Code",
  detect: () => {
    const configPath = getVSCodeConfigPath();
    const config = readJSON(configPath);
    return config && config["roocline.mcpServers"];
  },
  getConfigPath: () => getVSCodeConfigPath(),
  getConfig: (data) => data["roocline.mcpServers"] || {},
  setConfig: (configData, serverName, serverConfig) => {
    if (!configData["roocline.mcpServers"]) {
      configData["roocline.mcpServers"] = {};
    }
    configData["roocline.mcpServers"][serverName] = serverConfig;
    return configData;
  },
  write: (filePath, config) => writeJSON(filePath, config),
};

// ═══════════════════════════════════════════════════════════════════════════
// Generic/Universal MCP Config (for other tools)
// ═══════════════════════════════════════════════════════════════════════════
export const universal = {
  name: "Universal (.config/mcp)",
  detect: () => true, // Always available as fallback
  getConfigPath: () => path.join(home, ".config", "mcp", "servers.json"),
  getConfig: (data) => data.servers || {},
  setConfig: (configData, serverName, serverConfig) => {
    configData.servers = configData.servers || {};
    configData.servers[serverName] = serverConfig;
    return configData;
  },
  write: (filePath, config) => writeJSON(filePath, config),
};

// Export all agents
export const agents = [
  claudeDesktop,
  claudeCode,
  cursor,
  cline,
  windsurf,
  continueDev,
  rooCode,
  universal, // Always include as fallback
];

// Export by name for easy access
export const agentsMap = {
  "claude-desktop": claudeDesktop,
  "claude-code": claudeCode,
  cursor: cursor,
  cline: cline,
  windsurf: windsurf,
  continue: continueDev,
  "roo-code": rooCode,
  universal: universal,
};
