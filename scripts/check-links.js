import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';

const distDir = './dist';

function getAllHtmlFiles(dir) {
  const files = [];
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllHtmlFiles(fullPath));
    } else if (extname(item) === '.html') {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveInternalLink(link, sourceFile) {
  const decodedLink = decodeURIComponent(link);
  const basePath = decodedLink.startsWith('/')
    ? join(distDir, decodedLink)
    : join(dirname(sourceFile), decodedLink);

  const candidates = [
    basePath,
    join(basePath, 'index.html'),
    basePath + '.html',
  ];

  return candidates.some(c => existsSync(c));
}

function checkLinks() {
  const htmlFiles = getAllHtmlFiles(distDir);
  const linkPattern = /href=["']([^"']+)["']/g;
  const errors = [];

  console.log(`Checking links in ${htmlFiles.length} HTML files...\n`);

  for (const file of htmlFiles) {
    const content = readFileSync(file, 'utf-8');
    const matches = [...content.matchAll(linkPattern)];

    for (const match of matches) {
      const link = match[1];

      if (
        link.startsWith('http') ||
        link.startsWith('#') ||
        link.startsWith('mailto:') ||
        link.startsWith('tel:') ||
        link.startsWith('data:') ||
        link.endsWith('.xml') ||
        link.endsWith('.svg')
      ) {
        continue;
      }

      const linkWithoutAnchor = link.split('#')[0];
      if (!linkWithoutAnchor) continue;

      if (!resolveInternalLink(linkWithoutAnchor, file)) {
        errors.push(`${file}: Broken link "${link}"`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Found ${errors.length} broken link(s):\n`);
    errors.forEach(err => console.error(`  ${err}`));
    process.exit(1);
  } else {
    console.log('All internal links verified!');
  }
}

checkLinks();
