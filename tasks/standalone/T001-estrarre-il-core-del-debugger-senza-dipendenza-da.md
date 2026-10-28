# T001 Estrarre il core del debugger senza dipendenza da vscode

- id: T001
- title: Estrarre il core del debugger senza dipendenza da vscode
- category: standalone
- priority: P3
- priority-reason: Priorità bassa per scelta del proprietario (2026-10-28): prima si chiude il lavoro in corso
- next-up: no
- state: open
- executor: kilo
- depends-on: -
- decider: -
- sources: ../tasks/_inbox/to-analyze/20261028-165954-debugger-dap-utilizzabile-senza-vs-code-/note.md (workspace N002)
- paths: src/tools, src/server, src/dap, src/extension.ts
- handoff: Read tasks/standalone/T001-estrarre-il-core-del-debugger-senza-dipendenza-da.md, do the open steps, run the Verification, update the task and the registry.
- kind: feature
- use-cases: UC001, UC002
- short: Core senza vscode

## Goal

Pacchetto core (tool MCP, registro sessioni, dump) che non importa vscode, con interfaccia DebugBackend (avvia/ferma sessione, richiesta DAP, eventi, breakpoint); backend VS Code che implementa l'interfaccia con vscode.debug; comportamento dell'estensione invariato.

## Steps

- [ ] Interfaccia DebugBackend e spostamento della logica dei tool sul core
- [ ] Backend VS Code
- [ ] Test esistenti verdi, nessun import di vscode nel core (controllo automatico)

## Verification

- Tutti i test dell'estensione verdi; il core si compila senza il modulo vscode
