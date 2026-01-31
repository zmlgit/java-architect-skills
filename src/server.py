
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Any, List

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("java-architect-mcp")

class SkillRegistry:
    def __init__(self):
        self.skills_dir = Path(__file__).parent / "skills"
        self.skills: Dict[str, Any] = {}
        self._discover_skills()

    def _discover_skills(self):
        """Simple discovery: finds directories in src/skills."""
        if not self.skills_dir.exists():
            return
            
        for child in self.skills_dir.iterdir():
            if child.is_dir() and not child.name.startswith('_'):
                self.skills[child.name] = {
                    "path": child,
                    "prompt_file": child / "prompt.md",
                    "config_dir": child / "config"
                }
                logger.info(f"Discovered skill: {child.name}")

class MCPServer:
    def __init__(self):
        self.name = "java-architect-superpowers"
        self.version = "1.0.0"
        self.registry = SkillRegistry()

    async def run(self):
        """Main loop for reading lines from stdin and processing JSON-RPC."""
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await asyncio.get_running_loop().connect_read_pipe(lambda: protocol, sys.stdin)
        
        while True:
            try:
                line = await reader.readline()
                if not line:
                    break
                
                request = json.loads(line)
                response = await self.handle_request(request)
                if response:
                    print(json.dumps(response), flush=True)
            except Exception as e:
                logger.error(f"Error processing request: {e}")

    async def handle_request(self, request):
        method = request.get("method")
        params = request.get("params", {})
        msg_id = request.get("id")

        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "capabilities": {
                        "resources": {},
                        "tools": {},
                        "prompts": {}
                    },
                    "serverInfo": {
                        "name": self.name,
                        "version": self.version
                    }
                }
            }
        
        # ---------------------------------------------------------
        # PROMPTS
        # ---------------------------------------------------------
        if method == "prompts/list":
             prompts = []
             for skill_name in self.registry.skills:
                 prompts.append({
                     "name": f"{skill_name}-review",
                     "description": f"Execute the {skill_name} Persona",
                     "arguments": []
                 })
             
             return {"jsonrpc": "2.0", "id": msg_id, "result": {"prompts": prompts}}

        if method == "prompts/get":
            name = params.get("name")
            # Parse skill name from prompt name "skillname-review"
            if name and name.endswith("-review"):
                skill_name = name.replace("-review", "")
                skill = self.registry.skills.get(skill_name)
                
                if skill and skill["prompt_file"].exists():
                    content = skill["prompt_file"].read_text(encoding="utf-8")
                    return {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "result": {
                            "messages": [
                                {
                                    "role": "user",
                                    "content": {
                                        "type": "text",
                                        "text": content
                                    }
                                }
                            ]
                        }
                    }

        # ---------------------------------------------------------
        # TOOLS
        # ---------------------------------------------------------
        if method == "tools/list":
            tools = []
            # Spring Reviewer Tool
            if "spring_reviewer" in self.registry.skills:
                tools.append({
                    "name": "spring_reviewer_analyze",
                    "description": "Run PMD analysis for Spring projects",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "target_path": {"type": "string", "description": "Absolute path to code"}
                        },
                        "required": ["target_path"]
                    }
                })
            
            return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": tools}}

        # ---------------------------------------------------------
        # TOOL EXECUTION
        # ---------------------------------------------------------
        if method == "tools/call":
            name = params.get("name")
            args = params.get("arguments", {})

            if name == "spring_reviewer_analyze":
                skill = self.registry.skills.get("spring_reviewer")
                target_path = args.get("target_path")
                
                if not skill or not target_path:
                     return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32602, "message": "Invalid arguments"}}

                # Path to bootstrap script
                script_path = skill["path"] / "scripts" / "pmd-bootstrap.py"
                
                # Execute synchronously for now (simplification)
                import subprocess
                try:
                    result = subprocess.run(
                        [sys.executable, str(script_path), target_path],
                        capture_output=True,
                        text=True,
                        timeout=300
                    )
                    
                    return {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": result.stdout + "\n" + result.stderr
                                }
                            ]
                        }
                    }
                except Exception as e:
                     return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32603, "message": str(e)}}

        return None

def main():
    server = MCPServer()
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
