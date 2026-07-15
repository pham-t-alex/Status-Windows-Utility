const { app, BrowserWindow, Menu } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { APP_NAME, HOST_VERSION, HOST_PORT, getDataDirectory, getStatePath } = require('./config');

app.setName(APP_NAME);
app.setPath('userData', getDataDirectory());

  const windows = new Map();
  const authToken = crypto.randomBytes(24).toString('hex');
  let server;

  function sendJson(response, statusCode, body) {
    const payload = JSON.stringify(body);
    response.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    });
    response.end(payload);
  }

  function sendError(response, statusCode, message) {
    sendJson(response, statusCode, { ok: false, error: message });
  }

  function readJson(request) {
    return new Promise((resolve, reject) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          request.destroy();
          reject(new Error('Request body is too large.'));
        }
      });
      request.on('end', () => {
        if (!body) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Request body must be valid JSON.'));
        }
      });
      request.on('error', reject);
    });
  }

  function getWindowState(entry) {
    return {
      window_id: entry.id,
      title: entry.title,
      content: entry.content,
      key: entry.key || null,
    };
  }

  function validateText(value, field, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'string') {
      throw new Error(`${field} must be a string.`);
    }
    return value;
  }

  function createStatusWindow(input) {
    const requestedKey = input.key === undefined ? null : validateText(input.key, 'key');
    if (requestedKey && input.reuse) {
      const existing = [...windows.values()].find((entry) => entry.key === requestedKey);
      if (existing) {
        existing.title = validateText(input.title, 'title', existing.title);
        existing.content = validateText(input.content, 'content', existing.content);
        existing.window.setAlwaysOnTop(input.always_on_top !== false, 'floating');
        if (process.platform === 'darwin') {
          existing.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        }
        existing.window.showInactive();
        existing.window.webContents.send('status-window:update', getWindowState(existing));
        return existing;
      }
    }

    const id = `win_${crypto.randomBytes(8).toString('hex')}`;
    const title = validateText(input.title, 'title', 'Status window');
    const content = validateText(input.content, 'content', '');
    const width = Number.isFinite(Number(input.width)) ? Number(input.width) : 360;
    const height = Number.isFinite(Number(input.height)) ? Number(input.height) : 220;
    const options = {
      width: Math.max(220, Math.round(width)),
      height: Math.max(120, Math.round(height)),
      resizable: input.resizable !== false,
      autoHideMenuBar: false,
      menuBarVisible: false,
      title,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    };

    if (input.x !== undefined) options.x = Math.round(Number(input.x));
    if (input.y !== undefined) options.y = Math.round(Number(input.y));

    const window = new BrowserWindow(options);
    window.setMenu(null);
    window.setMenuBarVisibility(false);
    window.setAlwaysOnTop(input.always_on_top !== false, 'floating');
    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    const entry = { id, key: requestedKey, title, content, window };
    windows.set(id, entry);

    window.on('closed', () => {
      windows.delete(id);
    });

    window.webContents.on('did-finish-load', () => {
      if (!window.isDestroyed()) {
        window.webContents.send('status-window:update', getWindowState(entry));
        window.showInactive();
      }
    });

    window.loadFile(path.join(__dirname, 'window.html'));
    return entry;
  }

  function updateStatusWindow(id, input) {
    const entry = windows.get(id);
    if (!entry || entry.window.isDestroyed()) {
      throw new Error(`Window not found: ${id}`);
    }

    if (input.title !== undefined) entry.title = validateText(input.title, 'title');
    if (input.content !== undefined) entry.content = validateText(input.content, 'content');
    if (input.always_on_top !== undefined) {
      if (typeof input.always_on_top !== 'boolean') throw new Error('always_on_top must be a boolean.');
      entry.window.setAlwaysOnTop(input.always_on_top, 'floating');
    }
    entry.window.setTitle(entry.title);
    entry.window.webContents.send('status-window:update', getWindowState(entry));
    return entry;
  }

  function closeStatusWindow(id) {
    const entry = windows.get(id);
    if (!entry || entry.window.isDestroyed()) {
      throw new Error(`Window not found: ${id}`);
    }
    entry.window.close();
  }

  async function handleRequest(request, response) {
    if (request.headers.authorization !== `Bearer ${authToken}`) {
      sendError(response, 401, 'Unauthorized.');
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true, service: APP_NAME, version: HOST_VERSION });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/windows') {
        sendJson(response, 200, { ok: true, windows: [...windows.values()].map(getWindowState) });
        return;
      }

      const input = request.method === 'DELETE' ? {} : await readJson(request);
      if (request.method === 'POST' && url.pathname === '/windows') {
        const entry = createStatusWindow(input);
        sendJson(response, 200, { ok: true, ...getWindowState(entry) });
        return;
      }

      if (parts.length === 2 && parts[0] === 'windows') {
        const id = decodeURIComponent(parts[1]);
        if (request.method === 'PATCH') {
          const entry = updateStatusWindow(id, input);
          sendJson(response, 200, { ok: true, ...getWindowState(entry) });
          return;
        }
        if (request.method === 'DELETE') {
          closeStatusWindow(id);
          sendJson(response, 200, { ok: true, window_id: id });
          return;
        }
      }

      sendError(response, 404, 'Route not found.');
    } catch (error) {
      sendError(response, 400, error.message || 'Request failed.');
    }
  }

  function writeHostState() {
    fs.mkdirSync(getDataDirectory(), { recursive: true });
    fs.writeFileSync(getStatePath(), JSON.stringify({
      pid: process.pid,
      port: HOST_PORT,
      version: HOST_VERSION,
      auth_token: authToken,
    }, null, 2));
  }

  function removeHostState() {
    try {
      const current = JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
      if (current.auth_token === authToken) fs.unlinkSync(getStatePath());
    } catch {
      // The state file may already have been removed by a client recovering from a crash.
    }
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    server = http.createServer((request, response) => {
      handleRequest(request, response);
    });
    server.on('error', (error) => {
      console.error(`Could not start host on port ${HOST_PORT}: ${error.message}`);
      app.quit();
    });
    server.listen(HOST_PORT, '127.0.0.1', writeHostState);
  });

  app.on('window-all-closed', () => {
    // The host remains alive so the next agent command can reuse it.
  });

  app.on('before-quit', () => {
    removeHostState();
    if (server) server.close();
  });
