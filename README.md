# Java Architect Superpowers 🦸‍♂️

A collection of **Agentic Skills** designed to augment Java Architects. Built on the Model Context Protocol (MCP).

## 📦 Installed Skills

| Skill | Description | Status |
|-------|-------------|--------|
| **[Spring Reviewer](src/skills/spring_reviewer/README.md)** | Advanced Spring Boot code auditor with generic static analysis + semantic reasoning. | ✅ Ready |
| **Database Architect** | Schema validation, index optimization, and migration safety. | 🚧 Planned |
| **Cloud Native Expert** | Kubernetes manifests, Helm charts, and 12-factor compliance. | 🚧 Planned |

## 🚀 Installation

### 1-Click Installation (Recommended for Local Use)
Run the included Node.js script to configure Claude Desktop automatically:

```bash
# Install dependencies and link to Claude
node scripts/install.js
```

### Skills CLI (e.g. Claude Code)
You can install directly using the `skills` CLI:
```bash
npx skills add https://github.com/zmlgit/java-architect-skills --skill java-architect-skills
```

### 1-Click Installation (Claude Desktop)
This will automatically configure Claude Desktop to use this server.

```bash
# Run the installation script
python3 scripts/install.py
```

### Manual Configuration
If you prefer to configure it manually, edit your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "java-architect": {
      "command": "python3",
      "args": ["/absolute/path/to/java-architect-skills/src/server.py"]
    }
  }
}
```

## 🛠️ Developing New Skills
To add a new skill:
1. Create a folder in `src/skills/<skill_name>`.
2. Add a `prompt.md` (System Prompt).
3. Add a `config/` directory for rules.
4. The server will automatically discover and register it!
