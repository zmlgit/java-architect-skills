#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- Configuration ---
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';
const API_ROOT = __dirname;
const SERVER_SCRIPT = path.join(API_ROOT, 'src', 'server.py');
const VENV_DIR = path.join(API_ROOT, '.venv');
const REQUIREMENTS = path.join(API_ROOT, 'requirements.txt');

// --- Helpers ---

function runSync(cmd, args) {
  try {
    execSync(`${cmd} ${args.join(' ')}`, { stdio: 'inherit', cwd: API_ROOT });
    return true;
  } catch (e) {
    return false;
  }
}

function getVenvPython() {
  if (process.platform === 'win32') {
    return path.join(VENV_DIR, 'Scripts', 'python.exe');
  } else {
    return path.join(VENV_DIR, 'bin', 'python');
  }
}

// --- Main Bootstrap Logic ---

console.error('[JavaArchitect] 🚀 Initializing MCP Server...');

// 1. Check/Create Virtual Environment
if (!fs.existsSync(VENV_DIR)) {
  console.error('[JavaArchitect] 📦 Creating Python Virtual Environment...');
  const venvCreated = runSync(PYTHON_CMD, ['-m', 'venv', '.venv']);
  
  if (!venvCreated) {
    console.error('[JavaArchitect] ❌ Failed to create venv. Is python3 installed?');
    process.exit(1);
  }
  
  // 2. Install Dependencies
  console.error('[JavaArchitect] 📥 Installing dependencies from requirements.txt...');
  const venvPython = getVenvPython();
  const installed = runSync(venvPython, ['-m', 'pip', 'install', '-r', REQUIREMENTS]);
  
  if (!installed) {
     console.error('[JavaArchitect] ❌ Failed to install dependencies.');
     process.exit(1);
  }
}

// 3. Launch Server
const pythonExe = getVenvPython();
console.error(`[JavaArchitect] ✅ Launching Server: ${pythonExe} ${SERVER_SCRIPT}`);

const serverProcess = spawn(pythonExe, [SERVER_SCRIPT], {
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: API_ROOT
});

serverProcess.on('error', (err) => {
  console.error(`[JavaArchitect] ❌ Failed to spawn process: ${err}`);
  process.exit(1);
});

serverProcess.on('close', (code) => {
  process.exit(code);
});
