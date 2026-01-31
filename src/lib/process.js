/**
 * Child process utilities for running external commands.
 */

import { spawn } from "child_process";

/**
 * Run a command and capture its output.
 * @param {string} command - Command to run
 * @param {string[]} args - Arguments to pass to the command
 * @param {Object} options - Options to pass to spawn
 * @returns {Promise<{stdout: string, stderr: string, code: number|null}>}
 */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));

    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Run a Node.js script and return formatted MCP content.
 * @param {string} scriptPath - Path to the Node.js script
 * @param {string[]} args - Arguments to pass to the script
 * @returns {Promise<{content: Array<{type: string, text: string}>, isError?: boolean}>}
 */
export function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data) => (output += data.toString()));
    child.stderr.on("data", (data) => (errorOutput += data.toString()));

    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          content: [{ type: "text", text: output + "\n" + errorOutput }],
        });
      } else {
        resolve({
          isError: true,
          content: [
            {
              type: "text",
              text: `Error (Exit Code ${code}):\n${errorOutput}\n${output}`,
            },
          ],
        });
      }
    });

    child.on("error", (err) => {
      resolve({
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to spawn process: ${err.message}`,
          },
        ],
      });
    });
  });
}
