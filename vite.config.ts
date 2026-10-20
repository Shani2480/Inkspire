import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

function systemFonts(): Plugin {
  return {
    name: "system-fonts",
    configureServer(server) {
      server.middlewares.use("/system-fonts", (_request, response) => {
        execFile("fc-list", ["-f", "%{family}\n"], { timeout: 4000 }, (error, stdout) => {
          response.setHeader("Content-Type", "application/json")
          if (error) {
            response.end("[]")
            return
          }
          const names = new Set<string>()
          for (const line of stdout.split("\n")) {
            for (const family of line.split(",")) {
              const name = family.trim()
              if (name && name.length <= 80) {
                names.add(name)
              }
            }
          }
          response.end(JSON.stringify([...names].sort((left, right) => left.localeCompare(right))))
        })
      })
    },
  }
}

const host = process.env.TAURI_DEV_HOST
const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), systemFonts()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}))
