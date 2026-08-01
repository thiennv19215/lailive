import { describe, expect, it } from 'vitest';
import { createAuxiliaryWindowOptions, createMainWindowOptions } from '../../electron/main/window-options';

describe('main window security and readiness shell', () => {
  it('creates an isolated renderer window with a preload', () => {
    const options = createMainWindowOptions('C:/app/preload.mjs');
    expect(options.show).toBe(false);
    expect(options.webPreferences).toMatchObject({
      preload: 'C:/app/preload.mjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });

  it('creates a frameless isolated auxiliary window', () => {
    const options = createAuxiliaryWindowOptions('C:/app/preload.mjs', 'guide');
    expect(options).toMatchObject({
      frame: false,
      show: false,
      title: 'Hướng dẫn',
      backgroundColor: '#0b0b0d',
    });
    expect(options.webPreferences).toMatchObject({
      preload: 'C:/app/preload.mjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });

  it('uses the measured reference viewport for confirmed auxiliary windows', () => {
    expect(createAuxiliaryWindowOptions('C:/app/preload.mjs', 'guide')).toMatchObject({ width: 800, height: 542 });
    expect(createAuxiliaryWindowOptions('C:/app/preload.mjs', 'feedback')).toMatchObject({ width: 700, height: 600 });
    expect(createAuxiliaryWindowOptions('C:/app/preload.mjs', 'monitor')).toMatchObject({ width: 702, height: 502 });
    expect(createAuxiliaryWindowOptions('C:/app/preload.mjs', 'payment')).toMatchObject({
      width: 502,
      height: 400,
      minWidth: 502,
      minHeight: 400,
    });
    expect(createAuxiliaryWindowOptions('C:/app/preload.mjs', 'user')).toMatchObject({ width: 700, height: 500 });
    expect(createAuxiliaryWindowOptions('C:/app/preload.mjs', 'setup')).toMatchObject({ width: 800, height: 542 });
    expect(createAuxiliaryWindowOptions('C:/app/preload.mjs', 'log')).toMatchObject({ width: 800, height: 600 });
  });
});
