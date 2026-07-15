# Agent Windows Usage Guide

Agent Windows gives an AI agent small persistent desktop windows for status updates, progress, notes, and other information that should remain visible while the agent works.

The agent communicates with a background window host through a command-line interface. The host starts automatically the first time a command needs it.

## 1. Install

From the project directory:

```bash
npm install
```

Node.js is required. The project currently uses Electron for the desktop window host.

The examples below use `agent-windows` as shorthand. In a local checkout, use the platform wrapper or `node bin/agent-windows.js` shown above.

## 2. Run a command

### Windows PowerShell

```powershell
.\agent-windows.ps1 create --title "Build Status" --content "Compiling..."
```

### macOS/Linux

```bash
./agent-windows.sh create --title "Build Status" --content "Compiling..."
```

You can also invoke the Node CLI directly on any platform:

```bash
node bin/agent-windows.js create --title "Build Status" --content "Compiling..."
```

Every successful command writes one JSON object to standard output. Errors are written to standard error and return a non-zero exit code.

## 3. Create a window

```bash
agent-windows create \
  --title "Build Status" \
  --content "Compiling..."
```

Example response:

```json
{
  "ok": true,
  "window_id": "win_7f3a91c2",
  "title": "Build Status",
  "content": "Compiling...",
  "key": null
}
```

The host generates `window_id`. Save it for later `update` and `close` commands. Do not generate the ID yourself.

Windows are resizable and stay above ordinary application windows by default. They are shown without taking keyboard focus. The title wraps when necessary, and content that does not fit is clipped without a scrollbar.

## 4. Update a window

Use the returned ID:

```bash
agent-windows update \
  --window-id win_7f3a91c2 \
  --content "Build succeeded"
```

The title can also be updated:

```bash
agent-windows update \
  --window-id win_7f3a91c2 \
  --title "Complete" \
  --content "All tests passed."
```

Only fields supplied to `update` change. For example, updating the content leaves the title unchanged.

## 5. Send multiline content

Use `--stdin` instead of putting long text in a command-line argument.

### macOS/Linux

```bash
printf 'Step 1 complete\nStep 2 complete\nAll tests passed.\n' |
  agent-windows update --window-id win_7f3a91c2 --stdin
```

### Windows PowerShell

```powershell
@"
Step 1 complete
Step 2 complete
All tests passed.
"@ | .\agent-windows.ps1 update --window-id win_7f3a91c2 --stdin
```

## 6. Close a window

Close it through the CLI:

```bash
agent-windows close --window-id win_7f3a91c2
```

The native window close control works too. Closing a window removes it from the host, so its ID is no longer valid.

## 7. List active windows

```bash
agent-windows list
```

Example response:

```json
{
  "ok": true,
  "windows": [
    {
      "window_id": "win_7f3a91c2",
      "title": "Build Status",
      "content": "Compiling...",
      "key": null
    }
  ]
}
```

Use `list` to recover IDs if an agent loses them during a long-running task.

## 8. Window options

Create supports these options:

| Option | Description |
| --- | --- |
| `--title <text>` | Window title. |
| `--content <text>` | Initial content. |
| `--stdin` | Read content from standard input. |
| `--width <pixels>` | Initial width; default is 360. |
| `--height <pixels>` | Initial height; default is 220. |
| `--x <pixels>` | Initial horizontal position. |
| `--y <pixels>` | Initial vertical position. |
| `--always-on-top` | Keep the window above ordinary windows; this is the default. |
| `--not-always-on-top` | Use ordinary window stacking instead. |
| `--key <name>` | Optional semantic name for recovery. |
| `--reuse` | Reuse an existing window with the same key. |

For example:

```bash
agent-windows create \
  --title "Agent Notes" \
  --content "Watching deployment logs" \
  --width 420 \
  --height 240 \
  --x 1200 \
  --y 80
```

## 9. Retry-safe creation with keys

Normally, every `create` command creates a new window and returns a new ID. If an agent might retry a command after losing its response, provide a key and `--reuse`:

```bash
agent-windows create \
  --key deployment-status \
  --reuse \
  --title "Deployment" \
  --content "Starting..."
```

If a window with `deployment-status` already exists, it is updated and reused instead of creating a duplicate.

## 10. Host behavior

The first CLI command starts the background host automatically. The host stays alive after the CLI command exits so subsequent commands can address the same windows.

The host listens only on localhost and uses a local authentication token. It does not expose the windows to the network.

When developing, the host can also be started manually:

```bash
npm start
```

The host itself does not show a window until a `create` command is issued.

## 11. Useful agent pattern

```text
1. create a window
2. save the returned window_id
3. update the content as work progresses
4. close the window when the task is complete
```

Example:

```bash
WINDOW_JSON=$(agent-windows create --title "Research" --content "Starting...")
# Extract window_id using the agent's JSON handling.
agent-windows update --window-id win_... --content "Reading sources..."
agent-windows update --window-id win_... --content "Finished"
agent-windows close --window-id win_...
```

Agents should treat the JSON response as the source of truth rather than parsing human-readable messages.

## 12. Troubleshooting

### The command says the host did not start

Run the host in the foreground to see startup output:

```bash
npm start
```

Then run the CLI command from another terminal.

### A styling or host-code change is not visible

The host is persistent. A previously running host may still have the old code loaded. Close the old host process and run a new `create` command, or restart the development session.

### The window is hidden behind another app

Windows are always-on-top by default. If ordinary stacking was explicitly enabled, update it:

```bash
agent-windows update --window-id win_7f3a91c2 --always-on-top
```

### The window ID is no longer valid

The window was probably closed by the user or by a previous `close` command. Use `list` to inspect the active windows and create a new one if necessary.

## Development checks

```bash
npm test
```

The current MVP intentionally does not include buttons, forms, Markdown rendering, or interactive agent callbacks. Those can be added later without changing the basic `create`/`update`/`close` workflow.
