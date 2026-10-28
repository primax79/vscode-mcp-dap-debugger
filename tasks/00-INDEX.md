# Task Index

## Use cases

<!-- ai-orch:generated use-cases -->
| Id | Priority | Use Case | Stage | Actor | Linked tasks |
| --- | --- | --- | --- | --- | --- |
| UC001 (Autonomous agent debugs Python) | P3 | [Autonomous agent debugs a Python service without VS Code](use-cases/UC001-autonomous-agent-debugs-a-python-service-without-vs-code.md) | planned (proposed) | Autonomous agent | T001, T002, T003 |
| UC002 (Owner sees agent debug) | P3 | [Owner sees agent debug sessions in the VS Code extension](use-cases/UC002-owner-sees-agent-debug-sessions-in-the-vs-code-extension.md) | planned (proposed) | Owner | T001, T003 |
| UC003 (Autonomous agent debugs Java) | P3 | [Autonomous agent debugs a Java (gCube) component without VS Code](use-cases/UC003-autonomous-agent-debugs-a-java-gcube-component-without-vs-code.md) | planned (proposed) | Autonomous agent | T004 |
<!-- /ai-orch:generated use-cases -->

## Next up

<!-- ai-orch:generated next-up -->
| Id | Priority | Task | Executor | Handoff |
| --- | --- | --- | --- | --- |
<!-- /ai-orch:generated next-up -->

## Tasks by category

<!-- ai-orch:generated tasks-by-category -->
### standalone

Tasks in `standalone`. Owner session: unassigned ([README](standalone/README.md)).

| Id | Priority | Task | State | Executor | Depends on |
| --- | --- | --- | --- | --- | --- |
| T001 (Core senza vscode) | P3 | [Estrarre il core del debugger senza dipendenza da vscode](standalone/T001-estrarre-il-core-del-debugger-senza-dipendenza-da.md) | open | kilo | - |
| T002 (Standalone Python e Node) | P3 | [Backend standalone e dap-mcp headless per Python e Node](standalone/T002-backend-standalone-e-dap-mcp-headless-per-python-e.md) | open | kilo | T001 |
| T003 (Go, Rust e monitor) | P3 | [Backend standalone per Go e Rust; sessioni headless visibili nell'estensione](standalone/T003-backend-standalone-per-go-e-rust-sessioni-headless.md) | open | kilo | T002 |
| T004 (Studio debug Java) | P3 | [Studio: debug Java senza VS Code (java-debug, JDWP) per i componenti gCube](standalone/T004-studio-debug-java-senza-vs-code-java-debug-jdwp-pe.md) | open | self | T002 |
<!-- /ai-orch:generated tasks-by-category -->

## Decisions waiting

<!-- ai-orch:generated decisions -->
| Task / Initiative | Question (exact) | Decider | Blocks |
| --- | --- | --- | --- |
| - | None. | - | - |
<!-- /ai-orch:generated decisions -->

## Done

<!-- ai-orch:generated done -->
| Id | Task | Result | Closed |
| --- | --- | --- | --- |
<!-- /ai-orch:generated done -->
