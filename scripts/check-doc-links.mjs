/** Check local file links in maintained Markdown. URL fragments are not validated. */
import fs from 'node:fs/promises';
import path from 'node:path';

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(file);
      return entry.name.endsWith('.md') ? [file] : [];
    }),
  );
  return nested.flat();
}

const files = [
  'README.md',
  'CONTRIBUTING.md',
  'scripts/README.md',
  ...(await markdownFiles('docs')),
  ...(await markdownFiles('reference')),
];
let failures = 0;
for (const file of files) {
  const source = (await fs.readFile(file, 'utf8')).replace(/```[\s\S]*?```/g, '');
  const links = [
    ...source.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g),
    ...source.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm),
  ];
  for (const [, target] of links) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(target)) continue;
    const local = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!local) continue;
    try {
      await fs.access(path.resolve(path.dirname(file), local));
    } catch {
      console.error(`${file}: missing link target ${target}`);
      failures++;
    }
  }
}
if (failures) process.exitCode = 1;
else console.log(`Local file links pass in ${files.length} Markdown files.`);
