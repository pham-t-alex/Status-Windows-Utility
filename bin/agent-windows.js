#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { APP_NAME, HOST_PORT, HOST_VERSION, getStatePath } = require('../src/config');

function printHelp() {
  process.stdout.write(`Usage:
  agent-windows create [options]
  agent-windows update --window-id <id> [options]
  agent-windows close --window-id <id>
  agent-windows list

Create/update options:
  --title <text>          Window title
  --content <text>        Window content
  --stdin                 Read content from standard input
  --width <pixels>        Initial width (default: 360)
  --height <pixels>       Initial height (default: 220)
  --x <pixels>            Initial x position
  --y <pixels>            Initial y position
  --always-on-top         Keep the window above other windows (default)
  --not-always-on-top     Use ordinary window stacking instead
  --key <name>            Optional semantic key
  --reuse                 Reuse an existing window with the same key

Examples:
  agent-windows create --title "Build" --content "Compiling..."
  echo "Build succeeded" | agent-windows update --window-id win_... --stdin
  agent-windows close --window-id win_...
`);
}

function fail(message) {
  process.stderr.write(`agent-windows: ${message}\n`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const result = { _: [] };
  const flags = new Set(['stdin', 'always-on-top', 'not-always-on-top', 'reuse', 'help']);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      result._.push(argument);
      continue;
    }
    const name = argument.slice(2);
    if (flags.has(name)) {
      result[name] = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}.`);
    }
    result[name] = value;
    index += 1;
  }
  return result;
}

function readStdin() {
  if (process.stdin.isTTY) return Promise.reject(new Error('--stdin requires piped input.'));
  return new Promise((resolve, reject) => {
    let content = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { content += chunk; });
    process.stdin.on('end', () => resolve(content));
    process.stdin.on('error', reject);
  });
}

function readHostState() {
  try {
    return JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
  } catch {
    return null;
  }
}

function request(method, route, body, state) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = http.request({
      hostname: '127.0.0.1',
      port: state.port || HOST_PORT,
      path: route,
      method,
      headers: {
        Authorization: `Bearer ${state.auth_token}`,
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        } : {}),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(responseBody);
        } catch {
          reject(new Error(`Host returned invalid JSON (HTTP ${response.statusCode}).`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300 || parsed.ok === false) {
          reject(new Error(parsed.error || `Host request failed (HTTP ${response.statusCode}).`));
          return;
        }
        resolve(parsed);
      });
    });
    request.setTimeout(1500, () => request.destroy(new Error('Host request timed out.')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function getHostHealth(state) {
  if (!state || !state.auth_token) return Promise.resolve(null);
  return request('GET', '/health', undefined, state).catch(() => null);
}

function hostIsRunning(state) {
  return getHostHealth(state).then((health) => Boolean(
    health && health.service === APP_NAME && health.version === HOST_VERSION,
  ));
}

async function stopOldHost(state) {
  const health = await getHostHealth(state);
  if (!state || !health || health.service !== APP_NAME || !Number.isInteger(Number(state.pid))) return;
  try {
    process.kill(Number(state.pid));
  } catch {
    // The process may already have exited; its state file is cleaned up below.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

function startHost() {
  const electronPath = require('electron');
  const projectRoot = path.resolve(__dirname, '..');
  const child = spawn(electronPath, [projectRoot, '--host'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, STATUS_WINDOWS_HOST: '1' },
  });
  child.unref();
}

async function ensureHost() {
  let state = readHostState();
  if (await hostIsRunning(state)) return state;

  await stopOldHost(state);

  try {
    if (state) fs.unlinkSync(getStatePath());
  } catch {
    // A stale state file is harmless if it cannot be removed immediately.
  }

  startHost();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    state = readHostState();
    if (await hostIsRunning(state)) return state;
  }
  throw new Error('The window host did not start. Try running `npm start` to see its logs.');
}

function numberOption(value, name) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`--${name} must be a number.`);
  return number;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed._[0];
  if (!command || parsed.help || command === 'help') {
    printHelp();
    return;
  }

  if (!['create', 'update', 'close', 'list'].includes(command)) {
    throw new Error(`Unknown command: ${command}.`);
  }

  const state = await ensureHost();
  if (command === 'list') {
    const result = await request('GET', '/windows', undefined, state);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (command === 'close') {
    const id = parsed['window-id'] || parsed.id;
    if (!id) throw new Error('close requires --window-id.');
    const result = await request('DELETE', `/windows/${encodeURIComponent(id)}`, undefined, state);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  let content = parsed.content;
  if (parsed.stdin) content = await readStdin();
  if (content !== undefined && typeof content !== 'string') throw new Error('Content must be text.');

  if (command === 'create') {
    const input = {
      title: parsed.title,
      content,
      width: numberOption(parsed.width, 'width'),
      height: numberOption(parsed.height, 'height'),
      x: numberOption(parsed.x, 'x'),
      y: numberOption(parsed.y, 'y'),
      always_on_top: !parsed['not-always-on-top'],
      key: parsed.key,
      reuse: Boolean(parsed.reuse),
    };
    const result = await request('POST', '/windows', input, state);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  const id = parsed['window-id'] || parsed.id;
  if (!id) throw new Error('update requires --window-id.');
  if (parsed.title === undefined && content === undefined && parsed['always-on-top'] === undefined && parsed['not-always-on-top'] === undefined) {
    throw new Error('update requires --title, --content, --stdin, --always-on-top, or --not-always-on-top.');
  }
  const input = {
    title: parsed.title,
    content,
    ...(parsed['always-on-top'] !== undefined ? { always_on_top: true } : {}),
    ...(parsed['not-always-on-top'] !== undefined ? { always_on_top: false } : {}),
  };
  const result = await request('PATCH', `/windows/${encodeURIComponent(id)}`, input, state);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => fail(error.message || String(error)));
