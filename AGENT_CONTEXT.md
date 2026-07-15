# Agent Windows

Use one `agent-windows` window for each task.

- When starting a task, run `agent-windows create --title "<cwd string>" --status in-progress --content "<task>"`.
- Save the returned `window_id`.
- Update with `agent-windows update --window-id <id> --status <status> --content "<current task or result>"`.
- Statuses: `in-progress`, `waiting-user`, `blocked`, `complete`, `error`.
- Finish with status `complete` and leave the window visible.
- If the ID is lost, use `agent-windows list` before creating another window.
