/// <reference types="astro/client" />

type CloudflareEnv = {
  // Set to the exact string 'false' ONLY on the private/tailnet build.
  // The public deploy sets nothing — absence is the public configuration.
  PUBLIC_FEED?: string;
};
type Runtime = import('@astrojs/cloudflare').Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
