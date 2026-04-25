import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');

const bannedNeedles = [
  { needle: "from 'framer-motion'", message: "Use `motion/react` (project standard) instead of `framer-motion`." },
  { needle: 'from "framer-motion"', message: "Use `motion/react` (project standard) instead of `framer-motion`." },
  { needle: "require('framer-motion')", message: "Use `motion/react` (project standard) instead of `framer-motion`." },
  { needle: 'require("framer-motion")', message: "Use `motion/react` (project standard) instead of `framer-motion`." }
];

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
    yield fullPath;
  }
}

const matches = [];
for await (const filePath of walk(srcDir)) {
  const content = await readFile(filePath, 'utf8');
  for (const banned of bannedNeedles) {
    if (content.includes(banned.needle)) {
      matches.push({
        filePath: path.relative(root, filePath),
        needle: banned.needle,
        message: banned.message
      });
    }
  }
}

if (matches.length) {
  console.error('Banned imports detected:\n');
  for (const match of matches) {
    console.error(`- ${match.filePath}: contains ${JSON.stringify(match.needle)}\n  ${match.message}`);
  }
  console.error('\nFix these and re-run.');
  process.exit(1);
}

console.log('Import checks passed.');

