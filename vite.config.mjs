import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { localTrackingPlugin } from "./server/tracking.mjs";

export default defineConfig({
  plugins: [
    localTrackingPlugin(
      fileURLToPath(new URL("./.agentarium.local.json", import.meta.url)),
    ),
  ],
  server: {
    host: "127.0.0.1",
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/.agentarium.local.json",
        "**/.agentarium/**",
      ],
    },
  },
});
