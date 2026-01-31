# Master Agent

Distributed analysis orchestrator for large Java projects. Handles chunking, checkpointing, and worker coordination.

## Features

- **Automatic Chunking**: Splits large projects into manageable chunks
- **Checkpoint System**: Auto-saves progress, supports resume after interruption
- **State Management**: Tracks completed/pending/failed chunks
- **Result Verification**: Cross-validates to reduce AI hallucinations
- **Progress Tracking**: Real-time progress percentage

## Tools

### `analyze`
Start distributed analysis with chunking and checkpoint support.

```bash
master-agent-analyze target_path="/path/to/project" chunk_size=50
```

### `resume`
Resume interrupted analysis from checkpoint.

```bash
master-agent-resume target_path="/path/to/project"
```

### `status`
Show analysis status and progress.

```bash
master-agent-status
```

## How It Works

1. **Planning Phase**: Scan project structure and generate analysis plan
2. **Chunking Phase**: Split project into chunks (configurable size)
3. **Analysis Phase**: Execute worker agents on each chunk
4. **Aggregation Phase**: Combine results from all chunks
5. **Verification Phase**: Cross-validate results

## Checkpoint System

Analysis state is automatically saved to `.java-archient-checkpoints/` directory.
You can resume analysis anytime even if the process is interrupted.

## Environment Variables

- `JAVA_ARCHITECT_CHUNK_SIZE` - Files per chunk (default: 50)
- `JAVA_ARCHITECT_PARALLEL` - Max parallel workers (default: 3)
