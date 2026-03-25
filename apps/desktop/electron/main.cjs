const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createDesktopLogger, resolveDesktopLogDir } = require('./logger.cjs');

const rendererMode = process.env.ELECTRON_RENDERER_MODE
  || (app.isPackaged ? 'production' : 'development');
const isDev = rendererMode !== 'production';
const DEV_ORIGIN = process.env.ELECTRON_DEV_URL || 'http://127.0.0.1:5173';
const DIST_INDEX = path.join(__dirname, '..', 'dist', 'index.html');
const desktopLogger = createDesktopLogger('desktop-runtime');

function isAllowedNavigation(url) {
  if (isDev) return url.startsWith(DEV_ORIGIN);
  return url.startsWith('file://');
}

function createWindow() {
  desktopLogger.info('desktop_window_create', 'Creando ventana principal', {
    rendererMode,
    isDev
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  win.webContents.setWindowOpenHandler((details) => {
    desktopLogger.warn('desktop_block_new_window', 'Bloqueo de window.open', { url: details.url });
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      desktopLogger.warn('desktop_block_navigation', 'Navegación bloqueada', { url });
      event.preventDefault();
    }
  });
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    desktopLogger.error('desktop_load_fail', 'Fallo cargando renderer', {
      errorCode,
      errorDescription,
      url: validatedURL
    });
  });

  if (isDev) {
    win.loadURL(DEV_ORIGIN);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    if (!fs.existsSync(DIST_INDEX)) {
      desktopLogger.critical('desktop_missing_build', 'No existe build frontend para modo producción', {
        distIndex: DIST_INDEX
      });
      throw new Error('No existe build frontend para modo producción local. Ejecute: npm run build:local');
    }
    win.loadFile(DIST_INDEX);
  }
}

process.on('uncaughtException', (error) => {
  desktopLogger.critical('desktop_uncaught_exception', 'Excepción no controlada en Electron main', { error });
});

process.on('unhandledRejection', (reason) => {
  desktopLogger.critical('desktop_unhandled_rejection', 'Promesa rechazada sin manejo en Electron main', { reason });
});

app.whenReady().then(() => {
  desktopLogger.info('desktop_ready', 'Electron listo', {
    rendererMode,
    logDir: resolveDesktopLogDir()
  });
  createWindow();
});

app.on('window-all-closed', () => {
  desktopLogger.info('desktop_all_windows_closed', 'Todas las ventanas cerradas', { platform: process.platform });
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  desktopLogger.info('desktop_activate', 'Evento activate de aplicación', {
    openWindows: BrowserWindow.getAllWindows().length
  });
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
