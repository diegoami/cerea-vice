import { defineConfig } from "vite";

// Remote previews are opt-in: pass --host and name the exact gateway hostname.
const allowedHosts = (process.env.CEREA_ALLOWED_HOSTS ?? "")
  .split(",").map(host => host.trim()).filter(Boolean);

export default defineConfig({
  server: { host: "127.0.0.1", port: 5173, strictPort: true, allowedHosts },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, allowedHosts },
});
