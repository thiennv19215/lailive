import type { BrowserWindowConstructorOptions } from 'electron';
import { AUXILIARY_WINDOW_META, type AuxiliaryWindowName } from '../../src/shared/contracts/auxiliary-windows';

export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: '#f3f1eb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

export function createAuxiliaryWindowOptions(
  preloadPath: string,
  name: AuxiliaryWindowName,
): BrowserWindowConstructorOptions {
  const meta = AUXILIARY_WINDOW_META[name];
  return {
    width: meta.width,
    height: meta.height,
    minWidth: Math.min(640, meta.width),
    minHeight: Math.min(460, meta.height),
    title: meta.title,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0d',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}
