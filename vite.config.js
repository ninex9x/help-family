import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const localPath = (path) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: 'frontend',
  server: {
    host: '127.0.0.1',
    strictPort: true,
    // The development server must never serve the database, keys or legacy files.
    fs: {
      strict: true,
      allow: [localPath('./frontend'), localPath('./node_modules')],
      deny: [
        '**/.git/**',
        '**/data/**',
        '**/.env*',
        '**/.dev.vars*',
        '**/*.key',
        '**/*.sqlite*',
        '**/*.{crt,pem}',
      ],
    },
  },
  preview: { host: '127.0.0.1', strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true },
});
