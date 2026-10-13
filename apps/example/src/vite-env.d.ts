/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXTERIOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
