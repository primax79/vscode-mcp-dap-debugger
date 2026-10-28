# T003 Backend standalone per Go e Rust; sessioni headless visibili nell'estensione

- id: T003
- title: Backend standalone per Go e Rust; sessioni headless visibili nell'estensione
- category: standalone
- priority: P3
- priority-reason: Priorità bassa per scelta del proprietario (2026-10-28): prima si chiude il lavoro in corso
- next-up: no
- state: open
- executor: kilo
- depends-on: T002
- decider: -
- sources: ../tasks/_inbox/to-analyze/20261028-165954-debugger-dap-utilizzabile-senza-vs-code-/note.md (workspace N002)
- paths: src/backends, src/monitor-panel.ts
- handoff: Read tasks/standalone/T003-backend-standalone-per-go-e-rust-sessioni-headless.md, do the open steps, run the Verification, update the task and the registry.
- kind: feature
- use-cases: UC001, UC002
- short: Go, Rust e monitor

## Goal

Adapter delve (dlv dap) e CodeLLDB nel backend standalone; il pannello di monitoraggio dell'estensione elenca anche le sessioni avviate da dap-mcp e permette di fermarle.

## Steps

- [ ] Adapter Go e Rust
- [ ] Registro condiviso delle sessioni tra dap-mcp e l'estensione
- [ ] Test

## Verification

- UC002: sessione headless visibile e fermabile dall'estensione
