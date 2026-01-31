const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function getClaudeConfigPath() {
    const platform = os.platform();
    const home = os.homedir();
    
    if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else if (platform === 'win32') {
        return path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    } else {
        return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    }
}

function install() {
    console.log("🚀 Installing Java Architect Skills (Node.js) into Claude Desktop...");
    
    const configPath = getClaudeConfigPath();
    console.log(`📂 Config Path: ${configPath}`);
    
    // 1. Ensure Dependencies
    console.log("📦 Installing NPM dependencies...");
    try {
        execSync("npm install", { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    } catch (e) {
        console.error("❌ Failed to install npm packages. Do you have Node.js installed?");
        process.exit(1);
    }

    // 2. Read Config
    let configData = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
        try {
            configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            console.error("⚠️ Invalid JSON in config file. Proceeding with clear config.");
        }
    } else {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }

    // 3. Add Server
    // Absolute path to src/server.js
    const serverScript = path.resolve(__dirname, '..', 'src', 'server.js');
    
    configData.mcpServers["java-architect-skills"] = {
        command: "node",
        args: [serverScript]
    };

    // 4. Save
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    
    console.log("✅ Successfully installed 'java-architect-skills' MCP server!");
    console.log("👉 Please RESTART Claude Desktop to apply changes.");
}

install();
