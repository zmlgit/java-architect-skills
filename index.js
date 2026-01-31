#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to the Python server script
const serverScript = path.join(__dirname, 'src', 'server.py');

// Check if Python lies in path
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

// Verify Python availability
const checkPython = spawn(pythonCmd, ['--version']);

checkPython.on('error', () => {
  console.error('Error: Python 3 is required but not found in PATH.');
  console.error('Please install Python 3.10+ to use this MCP server.');
  process.exit(1);
});

checkPython.on('close', (code) => {
  if (code !== 0) {
    console.error('Error: Python 3 check failed.');
    process.exit(1);
  }

  // Launch the MCP Server via Python
  // We forward stdin/stdout/stderr to communicate with the host (Claude)
  const serverProcess = spawn(pythonCmd, [serverScript], {
    stdio: ['inherit', 'inherit', 'inherit']
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start Spring Reviewer MCP server:', err);
    process.exit(1);
  });

  serverProcess.on('close', (code) => {
    process.exit(code);
  });
});
