const { spawn, exec } = require('child_process');
const http = require('http');

const URL = process.env.CANDY_URL || 'http://localhost:3000';

function openBrowser() {
  const cmd = process.platform === 'win32' ? `start "" ${URL}`
    : process.platform === 'darwin' ? `open ${URL}`
    : `xdg-open ${URL}`;
  exec(cmd, { shell: true });
}

function checkServer(cb) {
  const req = http.get(URL, (res) => {
    res.destroy();
    cb(true);
  });
  req.on('error', () => cb(false));
}

checkServer((isUp) => {
  if (isUp) {
    openBrowser();
    return;
  }
  const child = spawn(process.execPath, ['../backend/server.js'], {
    stdio: 'inherit',
    cwd: __dirname,
  });
  // Open browser shortly after the server starts
  setTimeout(openBrowser, 800);

  // Forward exit
  const onExit = () => child.kill();
  process.on('SIGINT', onExit);
  process.on('SIGTERM', onExit);
});

