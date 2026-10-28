# UC003 - Autonomous agent debugs a Java (gCube) component without VS Code

- id: UC003
- title: Autonomous agent debugs a Java (gCube) component without VS Code
- actor: Autonomous agent
- approval: proposed
- priority: P3
- linked-tasks: T004
- verification-type: automated-probe
- last-tested: -
- last-verdict: -
- short: Autonomous agent debugs Java

## Description & Business Value
A headless agent attaches to a JVM (gCube SmartGears service or test) and debugs it through MCP tools without VS Code.

## Preconditions
JVM started with a JDWP agent or a supported Java debug adapter available

## Scenario / Interaction Steps
Agent attaches to the JVM; sets a breakpoint in a class; triggers the code; inspects stack and variables; detaches leaving the JVM running

## Automated Verification Command
```bash
echo 'No verification command specified'
```

## Acceptance Criteria
- [ ] Attach and detach work
- [ ] breakpoint in a gCube class hit
- [ ] JVM keeps running after detach

## AI Validation Log

