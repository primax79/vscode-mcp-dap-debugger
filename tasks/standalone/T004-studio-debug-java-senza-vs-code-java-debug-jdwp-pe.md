# T004 Studio: debug Java senza VS Code (java-debug, JDWP) per i componenti gCube

- id: T004
- title: Studio: debug Java senza VS Code (java-debug, JDWP) per i componenti gCube
- category: standalone
- priority: P3
- priority-reason: Priorità bassa per scelta del proprietario (2026-10-28): prima si chiude il lavoro in corso
- next-up: no
- state: open
- executor: self
- depends-on: T002
- decider: -
- sources: ../tasks/_inbox/to-analyze/20261028-165954-debugger-dap-utilizzabile-senza-vs-code-/note.md (workspace N002)
- paths: -
- handoff: Read tasks/standalone/T004-studio-debug-java-senza-vs-code-java-debug-jdwp-pe.md, do the open steps, run the Verification, update the task and the registry.
- kind: investigation
- use-cases: UC003
- short: Studio debug Java

## Goal

Valutare come fare debug Java headless: avviare java-debug con il language server, oppure collegarsi via JDWP a una JVM (SmartGears, test Maven) con un adapter minimo; costi, limiti, raccomandazione.

## Steps

- [ ] Prove su un servizio SmartGears 4 e su un test Maven
- [ ] Rapporto con raccomandazione

## Verification

- Rapporto in tasks/_reviews/ con una raccomandazione e un esempio funzionante o i motivi per cui non lo è
