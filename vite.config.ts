import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const experimentsDir = resolve(root, 'experiments');

/**
 * Every folder in experiments/ that has an index.html becomes its own page
 * in the build. Folders starting with "_" (like _template) are skipped.
 */
function experimentEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const dirent of readdirSync(experimentsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith('_')) continue;
    const html = resolve(experimentsDir, dirent.name, 'index.html');
    if (existsSync(html)) entries[`experiments/${dirent.name}`] = html;
  }
  return entries;
}

export default defineConfig({
  // Relative base so the built site works from any sub-path (e.g. GitHub Pages).
  base: './',
  build: {
    rollupOptions: {
      input: {
        shell: resolve(root, 'index.html'),
        ...experimentEntries(),
      },
    },
  },
});
