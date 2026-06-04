import { defineConfig } from 'vite';

/** GitHub project site: https://<user>.github.io/into-the-breach/ */
const GH_PAGES_BASE = '/into-the-breach/';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: process.env.GITHUB_PAGES === 'true' ? GH_PAGES_BASE : '/',
  server: { port: 5173, open: true },
});