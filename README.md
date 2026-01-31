# Java Architect Skills 🔧

A collection of **MCP Skills** designed to augment Java Architects. Built on the Model Context Protocol (MCP).

## 📦 Installed Skills

| Skill | Description | Status |
|-------|-------------|--------|
| **[Spring Reviewer](src/skills/analyzers/spring-reviewer/)** | Advanced Spring Boot code auditor with PMD static analysis + LLM reasoning. | ✅ Ready |
| **Database Architect** | Schema validation, index optimization, and migration safety. | 🚧 Planned |
| **Cloud Native Expert** | Kubernetes manifests, Helm charts, and 12-factor compliance. | 🚧 Planned |

## 🚀 Quick Installation

### Universal Installer (Recommended)

The installer automatically detects and configures MCP for all compatible AI agents on your system:

```bash
npm run install-mcp
```

**Supported Agents:**
| Agent | Detection | Config Location |
|-------|-----------|-----------------|
| Claude Desktop | ✅ | `~/Library/Application Support/Claude/` |
| Claude Code | ✅ | `~/.claude/` |
| Cursor | ✅ | `~/Library/Application Support/Cursor/` |
| Cline (VS Code) | ✅ | `~/Library/Application Support/Code/User/` |
| Windsurf | ✅ | `~/Library/Application Support/Windsurf/` |
| Continue.dev | ✅ | `~/.continue/` |
| Universal MCP | ✅ | `~/.config/mcp/` |

### Installation Options

```bash
# Full installation (npm install + MCP config)
npm run install-mcp

# Skip npm install (only MCP config)
npm run install-mcp -- --skip-npm

# Configure specific agent only
npm run install-mcp -- --agent=cursor

# Dry run (preview changes)
npm run install-mcp -- --dry-run
```

## 📋 Available Resources

After installation, these MCP resources are available:

| Type | Name | Description |
|------|------|-------------|
| **Tool** | `spring-reviewer-analyze` | Run PMD static analysis on Java/Spring code |
| **Prompt** | `spring-reviewer-review` | Spring Reviewer expert persona |

## 💻 Usage Examples

### Analyze Java Code
```
Use spring-reviewer-analyze to analyze /path/to/your/spring/project
```

### Code Review with Spring Expert
```
Use spring-reviewer-review to review this Spring Boot service class
```

## 🛠️ Manual Configuration

If automatic installation doesn't work, you can manually configure MCP:

### Claude Desktop
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "java-architect-skills": {
      "command": "node",
      "args": ["/absolute/path/to/spring-reviewer/src/server.js"]
    }
  }
}
```

### VS Code (Cline Extension)
Add to your VS Code `settings.json`:
```json
{
  "cline.mcpServers": {
    "java-architect-skills": {
      "command": "node",
      "args": ["/absolute/path/to/spring-reviewer/src/server.js"]
    }
  }
}
```

### Cursor
Create/Edit `~/Library/Application Support/Cursor/User/globalStorage/mcp-servers.json`:
```json
{
  "mcpServers": {
    "java-architect-skills": {
      "command": "node",
      "args": ["/absolute/path/to/spring-reviewer/src/server.js"]
    }
  }
}
```

## 🔧 Developing New Skills

To add a new skill:

1. Create a folder in `src/skills/<category>/<skill_name>/`
2. Add a `skill.json` with metadata
3. Add a `prompt.md` (system prompt)
4. Add a `scripts/` directory for tools
5. The server will automatically discover and register it!

Example structure:
```
src/skills/analyzers/my-skill/
├── skill.json          # Metadata (name, tools, etc.)
├── prompt.md           # System prompt for LLM
├── scripts/
│   └── analyze.js      # Tool implementation
└── config/
    └── rules.xml       # Configuration files
```

## 📝 License

MIT
