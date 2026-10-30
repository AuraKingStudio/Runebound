// Electron wrapper: npm install && npm start  (or npm run dist for a Windows .exe)
const { app, BrowserWindow } = require('electron');
function createWindow() {
  const win = new BrowserWindow({ width: 1100, height: 720, autoHideMenuBar: true, backgroundColor: '#0b0f14' });
  win.loadFile('index.html');
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
