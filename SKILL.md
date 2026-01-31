---
name: Java Architect Skills
description: MCP skills for Java Architects - Spring code review with PMD static analysis, AOP proxy detection, and best practices enforcement
version: 1.0.0
author: zmlio
license: MIT
tags: [java, spring, mcp, code-review, pmd, aop]
---

# Java Architect Skills

A comprehensive collection of agentic skills for Java Architects, built on the Model Context Protocol (MCP).

## Description

This skill provides advanced code analysis capabilities for Java and Spring Boot applications:

- **Spring Reviewer**: Deep auditing of Spring Boot applications with PMD static analysis
- **AOP Proxy Detection**: Catches @Transactional, @Async on private/final methods
- **Best Practices**: Enforces constructor injection, config externalization
- **Thread Safety**: Detects concurrency issues and singleton problems
- **NPE Prevention**: Finds null pointer risks and improper null checks

## Installation

```bash
npm install
npm run install
```

This will automatically configure MCP for:
- Claude Desktop
- Claude Code
- Cursor
- VS Code (Cline)
- And other MCP-compatible agents

## Usage

After installation, restart your AI agent and use:

- **Tool**: `spring-reviewer-analyze` - Run PMD analysis on Java code
- **Prompt**: `spring-reviewer-review` - Spring expert code review

## Example

```
Use spring-reviewer-analyze to analyze /path/to/your/spring/project
```

## Requirements

- Node.js >= 18
- PMD 7.0.0 (auto-installed)
