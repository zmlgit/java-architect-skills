#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { agents } from "./agents/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const skipNpm = args.includes("--skip-npm") || process.env.SKIP_NPM;
const specificAgent = args.find((a) => a.startsWith("--agent="))?.split("=")[1];
const dryRun = args.includes("--dry-run");
const isPostInstall = args.includes("--postinstall");

// Silent mode for postinstall (less output)
const silent = isPostInstall || process.env.MCP_INSTALL_SILENT;

// MCP Server Configuration
const SERVER_NAME = "java-architect-skills";
const SERVER_CONFIG = {
  command: "node",
  args: [path.resolve(__dirname, "..", "src", "server.js")],
};

function log(msg) {
  if (!silent) console.error(`\x1b[34m▸ ${msg}\x1b[0m`);
}

function success(msg) {
  if (!silent) console.error(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function warn(msg) {
  console.error(`\x1b[33m⚠ ${msg}\x1b[0m`);
}

function error(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
}

function info(msg) {
  if (!silent) console.error(`  ${msg}`);
}

async function installNpmDependencies() {
  log("Installing npm dependencies...");
  try {
    const result = await new Promise((resolve, reject) => {
      const npm = spawn("npm", ["install"], {
        cwd: path.join(__dirname, ".."),
        stdio: silent ? "ignore" : "pipe",
      });

      const timeout = setTimeout(() => {
        npm.kill();
        reject(new Error("npm install timeout"));
      }, 60000);

      npm.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      npm.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    success("Dependencies installed");
    return true;
  } catch (e) {
    if (!silent) {
      warn(`npm install failed: ${e.message}`);
      warn("Continuing with MCP configuration...");
    }
    return false;
  }
}

function configureAgent(agent) {
  try {
    const configPath = agent.getConfigPath();
    let configData = {};

    // Read existing config
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        configData = JSON.parse(content);
      } catch (e) {
        if (!silent) {
          warn(`Failed to parse ${configPath}, creating new`);
        }
        configData = {};
      }
    }

    // Check if already configured
    const existingServers = agent.getConfig(configData);
    if (existingServers[SERVER_NAME]) {
      return { agent: agent.name, status: "exists", path: configPath };
    }

    // Add our server
    const updatedConfig = agent.setConfig(configData, SERVER_NAME, SERVER_CONFIG);

    if (dryRun) {
      if (!silent) {
        log(`[DRY RUN] Would configure ${agent.name}`);
        log(`  Path: ${configPath}`);
      }
      return { agent: agent.name, status: "dry-run", path: configPath };
    }

    // Write config
    agent.write(configPath, updatedConfig);

    return { agent: agent.name, status: "configured", path: configPath };
  } catch (e) {
    return { agent: agent.name, status: "failed", error: e.message };
  }
}

async function install() {
  if (!silent) {
    console.error("\n" + "═".repeat(60));
    console.error("  🚀 Java Architect Skills - MCP Installer");
    console.error("═".repeat(60) + "\n");
  } else if (isPostInstall) {
    // Brief message for postinstall
    console.error("\n🔧 Configuring MCP for Java Architect Skills...\n");
  }

  // 1. Install npm dependencies
  if (!skipNpm) {
    await installNpmDependencies();
  } else if (!silent) {
    log("Skipping npm install (--skip-npm flag)");
  }

  if (!silent) console.error("");

  // 2. Detect and configure agents
  const availableAgents = specificAgent
    ? agents.filter((a) => a.name.toLowerCase().includes(specificAgent.toLowerCase()))
    : agents;

  const detected = availableAgents.filter((a) => {
    if (specificAgent || a === agents[agents.length - 1]) return true;
    return a.detect();
  });

  if (detected.length === 0 && !silent) {
    warn("No compatible agents detected");
    info("Install one of the following:");
    for (const agent of agents) {
      if (agent !== agents[agents.length - 1]) {
        info(`  • ${agent.name}`);
      }
    }
    return;
  }

  if (!silent) {
    log(`Found ${detected.length} compatible agent(s)\n`);
  }

  const results = [];
  for (const agent of detected) {
    if (!silent) info(`Configuring ${agent.name}...`);
    const result = configureAgent(agent);
    results.push(result);

    if (result.status === "configured") {
      if (!silent) success(`${agent.name} → ${result.path}`);
    } else if (result.status === "exists" && !silent) {
      log(`${agent.name} already configured`);
    } else if (result.status === "failed" && !silent) {
      error(`${agent.name} failed: ${result.error}`);
    }
  }

  // 3. Summary
  const configured = results.filter((r) => r.status === "configured");
  const existed = results.filter((r) => r.status === "exists");
  const failed = results.filter((r) => r.status === "failed");

  if (!silent) {
    console.error("\n" + "═".repeat(60));

    if (configured.length > 0) {
      success(`Configured ${configured.length} agent(s)`);
    }
    if (existed.length > 0) {
      log(`${existed.length} agent(s) already configured`);
    }
    if (failed.length > 0) {
      error(`${failed.length} agent(s) failed`);
    }

    console.error("═".repeat(60) + "\n");

    // 4. Available resources
    console.error("Available MCP resources:");
    console.error("  • Tool: spring-reviewer-analyze");
    console.error("  • Prompt: spring-reviewer-review\n");

    // 5. Next steps
    console.error("Next steps:");
    console.error("  1. Restart your AI agent/editor");
    console.error("  2. Start a new chat");
    console.error("  3. Try: 'Use spring-reviewer-analyze to analyze my code'\n");

    // 6. Agent-specific notes
    if (configured.some((r) => r.agent.includes("Claude"))) {
      info("For Claude Desktop/Code: Restart the application");
    }
    if (configured.some((r) => r.agent.includes("Cursor"))) {
      info("For Cursor: Reload the window (Cmd+R)");
    }
    if (configured.some((r) => r.agent.includes("VS Code"))) {
      info("For VS Code: Reload the window (Cmd+Shift+P > Developer: Reload)");
    }
  } else {
    // Silent summary
    if (configured.length > 0) {
      success(`Configured ${configured.length} agent(s) for MCP`);
    }
    if (existed.length > 0) {
      log(`${existed.length} agent(s) already configured`);
    }
    if (configured.length > 0 || existed.length > 0) {
      console.error("\n📋 Available: spring-reviewer-analyze (tool), spring-reviewer-review (prompt)");
      console.error("   Restart your AI agent to use these resources.\n");
    }
  }
}

// Run installation
install().catch((err) => {
  error(`Installation failed: ${err.message}`);
  if (!silent) process.exit(1);
});
