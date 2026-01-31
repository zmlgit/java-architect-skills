#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runNodeScript } from "./lib/process.js";
import { loadSkillMeta, isValidTool, getToolScriptPath } from "./lib/skill-loader.js";
import { log, error, success } from "./lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skill Registry Logic
class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this.skillsDir = path.join(__dirname, "skills");
    this.discoverSkills();
  }

  /**
   * Recursively discover skills in subdirectories.
   * @param {string} dir - Directory to scan
   * @param {string} category - Category path (e.g., "analyzers/spring_reviewer")
   */
  discoverSkills(dir = this.skillsDir, category = "") {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const entryCategory = category ? `${category}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Check if this directory has a skill.json (skill root)
        const meta = loadSkillMeta(entryPath);

        if (meta) {
          // This is a skill directory
          const skillName = entry.name;
          const promptFile = path.join(entryPath, "prompt.md");

          this.skills.set(skillName, {
            meta,
            path: entryPath,
            promptFile: fs.existsSync(promptFile) ? promptFile : null,
            configDir: path.join(entryPath, "config"),
            category: entryCategory,
          });
          log(`Discovered skill: ${skillName} (${entryCategory})`);
        } else {
          // Recurse into subdirectory
          this.discoverSkills(entryPath, entryCategory);
        }
      }
    }
  }

  /**
   * Get all tool definitions from all skills.
   * @returns {Array<{name: string, description: string, inputSchema: object, skillName: string}>}
   */
  getAllTools() {
    const tools = [];

    for (const [skillName, skill] of this.skills) {
      if (skill.meta.tools && Array.isArray(skill.meta.tools)) {
        for (const tool of skill.meta.tools) {
          if (isValidTool(tool)) {
            tools.push({
              name: `${skillName}-${tool.name}`,
              description: tool.description,
              inputSchema: tool.inputSchema,
              skillName,
              toolName: tool.name,
              script: tool.script,
            });
          }
        }
      }
    }

    return tools;
  }

  /**
   * Get all prompt definitions from all skills.
   * @returns {Array<{name: string, description: string}>}
   */
  getAllPrompts() {
    const prompts = [];

    for (const [skillName, skill] of this.skills) {
      if (skill.promptFile) {
        prompts.push({
          name: `${skillName}-review`,
          description: `Execute the ${skill.meta.displayName || skillName} Persona`,
          skillName,
        });
      }
    }

    return prompts;
  }

  /**
   * Get tool by its full name (e.g., "spring-reviewer-analyze").
   * @param {string} toolFullName - Full tool name
   * @returns {Object|null} Tool object or null
   */
  getTool(toolFullName) {
    const tools = this.getAllTools();
    return tools.find((t) => t.name === toolFullName) || null;
  }
}

const registry = new SkillRegistry();

// Initialize Server
const server = new Server(
  {
    name: "java-architect-skills",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

// ------------------------------------------------------------------
// PROMPTS
// ------------------------------------------------------------------

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const prompts = registry.getAllPrompts();
  return { prompts };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  let name = request.params.name;

  // Strip server prefix if present (e.g., "java-architect-skills:spring-reviewer-review")
  if (name.includes(":")) {
    name = name.split(":").pop();
  }

  if (!name || !name.endsWith("-review")) {
    throw new Error("Invalid prompt name");
  }

  const skillName = name.replace("-review", "");
  const skill = registry.skills.get(skillName);

  if (!skill || !skill.promptFile) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  const content = fs.readFileSync(skill.promptFile, "utf-8");
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: content,
        },
      },
    ],
  };
});

// ------------------------------------------------------------------
// TOOLS
// ------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = registry.getAllTools();
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = registry.getTool(name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const skill = registry.skills.get(tool.skillName);
  if (!skill) {
    throw new Error(`Skill not found: ${tool.skillName}`);
  }

  // Build arguments array from input schema
  const scriptPath = getToolScriptPath(skill.path, tool.script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Tool script not found: ${scriptPath}`);
  }

  // Convert args object to array based on inputSchema required fields
  const toolArgs = [];
  if (tool.inputSchema.properties) {
    for (const prop of Object.keys(tool.inputSchema.properties)) {
      if (args[prop] !== undefined) {
        toolArgs.push(args[prop]);
      }
    }
  }

  return runNodeScript(scriptPath, toolArgs);
});

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const skillCount = registry.skills.size;
  const toolCount = registry.getAllTools().length;
  const promptCount = registry.getAllPrompts().length;
  error(
    `Java Architect Skills Server running: ${skillCount} skills, ${toolCount} tools, ${promptCount} prompts`
  );
}

main().catch((error) => {
  error("Fatal error:" + error);
  process.exit(1);
});
