# tasks/ convention (task-pipeline + emergent tasks)

This repository's work is tracked with the `task-pipeline` convention of ai-orchestration
(`plugins/architect-side/skills/task-pipeline/`): emergent tasks under `tasks/<category>/T###-<slug>.md`, use cases
under `tasks/use-cases/`, and the live registry in `00-INDEX.md`. Use `ai-orch tasks ...` to create, transition,
validate and sync; new features follow the use-case-first workflow (`ai-orch tasks use-cases search`).

## Project settings

Content language of this registry (owner convention 2026-10-27): tasks and questions in Italian, use cases in
English. Section headings and header field names stay English: they are the format's fixed keywords.

```toml
[tasks]
language = "it"

[questions]
language = "it"

[use_cases]
language = "en"
```
