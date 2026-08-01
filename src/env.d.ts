/// <reference types="vite/client" />

import type { DesktopApi } from './shared/contracts/desktop-api';

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
