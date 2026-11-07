#!/usr/bin/env node
// Usage: npm run new <slug> [-- "Display title"]
// Copies experiments/_template to experiments/<slug> and fills in the placeholders.
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [slug, ...titleParts] = process.argv.slice(2);

if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run new <slug> [-- "Display title"]');
  console.error('The slug must be kebab-case, e.g. "liquid-buttons".');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const template = join(root, 'experiments', '_template');
const target = join(root, 'experiments', slug);

if (existsSync(target)) {
  console.error(`experiments/${slug} already exists.`);
  process.exit(1);
}

const title =
  titleParts.join(' ') || slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const date = new Date().toISOString().slice(0, 10);

cpSync(template, target, { recursive: true });

function fill(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      fill(file);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    writeFileSync(
      file,
      text.replaceAll('__TITLE__', title).replaceAll('__SLUG__', slug).replaceAll('__DATE__', date),
    );
  }
}
fill(target);

console.log(`Created experiments/${slug}. Run "npm run dev" and open #/${slug}.`);
