
import os
import sys
import json
import platform
from pathlib import Path

def get_claude_config_path():
    """Get the path to claude_desktop_config.json based on OS."""
    system = platform.system()
    home = Path.home()
    
    if system == "Darwin":  # macOS
        return home / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
    elif system == "Windows":
        return home / "AppData" / "Roaming" / "Claude" / "claude_desktop_config.json"
    else:
        # Linux / Fallback
        return home / ".config" / "Claude" / "claude_desktop_config.json"

def install():
    print("🚀 Installing Java Architect Skills into Claude Desktop...")
    
    config_path = get_claude_config_path()
    print(f"📂 Config Path: {config_path}")
    
    # 1. Ensure Config Exists
    if not config_path.exists():
        print("⚠️  Config file not found. Creating new one.")
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_data = {"mcpServers": {}}
    else:
        try:
            with open(config_path, 'r') as f:
                config_data = json.load(f)
        except json.JSONDecodeError:
            print("❌ Error: Existing config is invalid JSON. Aborting.")
            sys.exit(1)
            
    # 2. Add Server Config
    # We use the absolute path of the current python environment and this repository
    repo_root = Path(__file__).parent.parent.resolve()
    server_script = repo_root / "src" / "server.py"
    
    if not server_script.exists():
        print(f"❌ Error: Could not find server script at {server_script}")
        sys.exit(1)
        
    # Use 'python3' or current executable
    python_exe = sys.executable 
    
    server_config = {
        "command": python_exe,
        "args": [str(server_script)]
    }
    
    # Update Config
    if "mcpServers" not in config_data:
        config_data["mcpServers"] = {}
        
    config_data["mcpServers"]["java-architect"] = server_config
    
    # 3. Save Config
    with open(config_path, 'w') as f:
        json.dump(config_data, f, indent=2)
        
    print("✅ Successfully installed 'java-architect' MCP server!")
    print("👉 Please RESTART Claude Desktop to apply changes.")

if __name__ == "__main__":
    install()
