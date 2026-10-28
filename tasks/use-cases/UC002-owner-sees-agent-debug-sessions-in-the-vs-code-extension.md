# UC002 - Owner sees agent debug sessions in the VS Code extension

- id: UC002
- title: Owner sees agent debug sessions in the VS Code extension
- actor: Owner
- approval: proposed
- priority: P3
- linked-tasks: T001, T003
- verification-type: automated-probe
- last-tested: -
- last-verdict: -
- short: Owner sees agent debug

## Description & Business Value
The VS Code extension shows the debug sessions started by headless agents (standalone backend) and lets the owner inspect or stop them.

## Preconditions
dap-mcp running for the workspace; VS Code open with the extension

## Scenario / Interaction Steps
Agent starts a session headless; owner opens the monitor panel; sees the session, its threads and stop reason; stops it

## Automated Verification Command
```bash
echo 'No verification command specified'
```

## Acceptance Criteria
- [ ] Headless sessions listed with their origin
- [ ] stop works
- [ ] no duplicate adapters

## AI Validation Log

