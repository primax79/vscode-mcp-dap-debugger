# UC001 - Autonomous agent debugs a Python service without VS Code

- id: UC001
- title: Autonomous agent debugs a Python service without VS Code
- actor: Autonomous agent
- approval: proposed
- priority: P3
- linked-tasks: T001, T002, T003
- verification-type: automated-probe
- last-tested: -
- last-verdict: -
- short: Autonomous agent debugs Python

## Description & Business Value
A headless agent on the office PC starts dap-mcp for a workspace and debugs a Python program or service through MCP tools, with no VS Code instance running.

## Preconditions
Workspace with .vscode/launch.json (debugpy config); dap-mcp installed; debugpy available

## Scenario / Interaction Steps
Agent starts 'dap-mcp --workspace <dir>'; lists launch configs; sets a breakpoint; starts the config; inspects stack and variables at the stop; continues; stops the session

## Automated Verification Command
```bash
echo 'No verification command specified'
```

## Acceptance Criteria
- [ ] Session starts and stops without VS Code
- [ ] breakpoint hit with correct file:line
- [ ] variables readable
- [ ] launch.json variables substituted

## AI Validation Log

