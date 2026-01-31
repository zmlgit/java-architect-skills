---
name: master-agent
version: 1.0.0
description: Distributed analysis orchestrator for large Java projects
author: zmlio
tags: [master-agent, distributed, scalable, checkpoint]
runtime: node
---

# Master Agent

Distributed Java project analysis with automatic chunking and checkpoint support.

## When to Use

Use this skill when analyzing:
- Very large Java projects (1000+ files)
- Projects with complex module structures
- Long-running analysis tasks that might be interrupted
- When you need progress tracking and resume capability

## Features

- Automatic project chunking
- Checkpoint-based persistence
- Worker orchestration
- Result aggregation
- Hallucination detection
