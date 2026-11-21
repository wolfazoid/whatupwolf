/// <reference types="astro/client" />

type CloudflareEnv = Record<string, never>;
type Runtime = import('@astrojs/cloudflare').Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
