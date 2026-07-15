# Agent Windows

Agent Windows provides small, persistent, resizable desktop windows that an AI agent can create and update.

Windows stay above ordinary application windows by default, like a desktop pet, but are shown without taking keyboard focus. Use `--not-always-on-top` when ordinary window stacking is preferred.

The project has two parts:

- A persistent Electron host that owns the windows.
- The `agent-windows` CLI, which sends commands to that host over localhost.

The same protocol works on macOS, Windows, and Linux. The host generates a unique `window_id`; agents use that ID for later updates and closing.

## Setup

```bash
npm install
```

## Commands

Start the host directly while developing:

```bash
npm start
```

The CLI starts the host automatically when needed:

```bash
node bin/agent-windows.js create --title "Build" --content "Compiling..."
```

On Windows PowerShell, the wrapper is:

```powershell
.\agent-windows.ps1 create --title "Build" --content "Compiling..."
```

On macOS/Linux, use:

```bash
./agent-windows.sh create --title "Build" --content "Compiling..."
```

The command returns machine-readable JSON:

```json
{"ok":true,"window_id":"win_7f3a91c2","title":"Build","content":"Compiling...","status":"in_progress","key":null}
```

Use the returned ID to update or close the window:

```bash
node bin/agent-windows.js update --window-id win_7f3a91c2 --content "Build succeeded"
node bin/agent-windows.js close --window-id win_7f3a91c2
```

For multiline content, use stdin:

```bash
printf 'Step 1 complete\nStep 2 complete\n' |
  node bin/agent-windows.js update --window-id win_7f3a91c2 --stdin
```

Other supported options include `--width`, `--height`, `--x`, `--y`, `--status`, `--always-on-top`, `--not-always-on-top`, `--title`, and `list`.

An optional `--key <name> --reuse` pair makes creation retry-safe when an agent may lose the returned ID:

```bash
node bin/agent-windows.js create --key build-status --reuse --title "Build" --content "Compiling..."
```

## Development

```bash
npm test
npm start
```

The host listens only on `127.0.0.1` and authenticates CLI requests with a short-lived local token stored in the user application-data directory.

For the complete command reference, see [USAGE.md](USAGE.md).
