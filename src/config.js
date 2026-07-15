const os = require('node:os');
const path = require('node:path');

const APP_NAME = 'status-windows-utility';
const HOST_VERSION = '0.2.0';
const HOST_PORT = 47821;
const STATE_FILE = 'host.json';

function getDataDirectory() {
  if (process.env.STATUS_WINDOWS_HOME) {
    return process.env.STATUS_WINDOWS_HOME;
  }

  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME);
}

function getStatePath() {
  return path.join(getDataDirectory(), STATE_FILE);
}

module.exports = {
  APP_NAME,
  HOST_VERSION,
  HOST_PORT,
  getDataDirectory,
  getStatePath,
};
