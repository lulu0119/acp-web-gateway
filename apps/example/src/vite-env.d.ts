/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MUKAE_URL?: string;
  readonly VITE_MUKAE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
