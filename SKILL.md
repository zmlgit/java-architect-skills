# Java Architect Skills

A comprehensive collection of agentic skills for Java Architects, built on the Model Context Protocol (MCP).

## Capabilities

- **Spring Reviewer**: Deep auditing of Spring Boot applications (AOP, Transactions, Concurrency).
- **Skill Registry**: Dynamic discovery of new skills dropped into the `skills/` directory.
- **MCP Compliance**: Fully compatible with Claude Desktop and other MCP clients.

## Installation

```bash
# Automated install via Python script
python3 scripts/install.py
```

## Architecture

- **Server**: `src/server.py` (Registry)
- **Skills**: Modular sub-directories in `src/skills/`
