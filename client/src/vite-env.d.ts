/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Turnstile site key; bot checks are skipped when unset. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
