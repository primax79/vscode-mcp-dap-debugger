# T002 Backend standalone e dap-mcp headless per Python e Node

- id: T002
- title: Backend standalone e dap-mcp headless per Python e Node
- category: standalone
- priority: P3
- priority-reason: Priorità bassa per scelta del proprietario (2026-10-28): prima si chiude il lavoro in corso
- next-up: no
- state: open
- executor: kilo
- depends-on: T001
- decider: -
- sources: ../tasks/_inbox/to-analyze/20261028-165954-debugger-dap-utilizzabile-senza-vs-code-/note.md (workspace N002)
- paths: src/backends, src/cli
- handoff: Read tasks/standalone/T002-backend-standalone-e-dap-mcp-headless-per-python-e.md, do the open steps, run the Verification, update the task and the registry.
- kind: feature
- use-cases: UC001
- short: Standalone Python e Node

## Goal

Client DAP proprio che lancia l'adapter (debugpy: python -m debugpy.adapter; js-debug: server DAP standalone) via stdio o socket; lettura di .vscode/launch.json con sostituzione di workspaceFolder, file, env; comando dap-mcp --workspace che espone i tool MCP senza VS Code.

## Steps

- [ ] Client DAP e gestione del processo dell'adapter
- [ ] Risoluzione di launch.json e delle variabili
- [ ] dap-mcp headless
- [ ] Test end-to-end con un programma Python e uno Node

## Verification

- UC001 provato su un programma Python reale senza VS Code aperto
