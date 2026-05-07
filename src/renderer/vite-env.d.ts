/// <reference types="vite/client" />

import type { DevToolboxApi } from "../shared/types";

declare global {
  interface Window {
    devToolbox: DevToolboxApi;
  }
}

export {};

