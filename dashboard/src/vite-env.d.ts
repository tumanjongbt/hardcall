/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EVENTS_API_URL?: string;
  readonly VITE_HARDCALL_ALLOW_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
