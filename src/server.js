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
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skill Registry Logic
class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this.skillsDir = path.join(__dirname, "skills");
    this.discoverSkills();
  }

  discoverSkills() {
    if (!fs.existsSync(this.skillsDir)) return;

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith("_")) {
        const skillPath = path.join(this.skillsDir, entry.name);
        const promptFile = path.join(skillPath, "prompt.md");
        
        // Simple discovery: if prompt.md exists, it's a valid skill
        if (fs.existsSync(promptFile)) {
            this.skills.set(entry.name, {
                path: skillPath,
                promptFile: promptFile,
                configDir: path.join(skillPath, "config")
            });
            console.error(`[MCP] Discovered skill: ${entry.name}`);
        }
      }
    }
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
  const prompts = [];
  for (const [name, _] of registry.skills) {
    prompts.push({
      name: `${name}-review`,
      description: `Execute the ${name} Persona`,
      arguments: [],
    });
  }
  return { prompts };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const name = request.params.name;
  if (!name || !name.endsWith("-review")) {
      throw new Error("Invalid prompt name");
  }

  const skillName = name.replace("-review", "");
  const skill = registry.skills.get(skillName);

  if (!skill) {
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
  const tools = [];
  
  // Spring Reviewer Tool
  if (registry.skills.has("spring_reviewer")) {
      tools.push({
          name: "spring_reviewer_analyze",
          description: "Run PMD analysis for Spring projects",
          inputSchema: {
              type: "object",
              properties: {
                  target_path: {
                      type: "string",
                      description: "Absolute path to code"
                  }
              },
              required: ["target_path"]
          }
      });
  }
  
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "spring_reviewer_analyze") {
        const skill = registry.skills.get("spring_reviewer");
        const targetPath = args.target_path;

        if (!skill || !targetPath) {
            throw new Error("Invalid arguments");
        }

        // We will call pmd-bootstrap.js (Node version)
        // Ensure that file exists
        const scriptPath = path.join(skill.path, "scripts", "pmd-bootstrap.js");
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Bootstrap script not found at ${scriptPath}`);
        }

        return new Promise((resolve, reject) => {
            const child = spawn("node", [scriptPath, targetPath], {
                stdio: ["ignore", "pipe", "pipe"],
            });

            let output = "";
            let errorOutput = "";

            child.stdout.on("data", (data) => output += data.toString());
            child.stderr.on("data", (data) => errorOutput += data.toString());

            child.on("close", (code) => {
                if (code === 0) {
                    resolve({
                        content: [{ type: "text", text: output + "\n" + errorOutput }],
                    });
                } else {
                    resolve({
                        isError: true,
                        content: [{ type: "text", text: `Error (Exit Code ${code}):\n${errorOutput}\n${output}` }],
                    });
                }
            });
            
             child.on("error", (err) => {
                 resolve({
                     isError: true,
                     content: [{ type: "text", text: `Failed to spawn process: ${err.message}`}]
                 });
             });
        });
    }

    throw new Error(`Tool not found: ${name}`);
});


// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Java Architect Skills Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
