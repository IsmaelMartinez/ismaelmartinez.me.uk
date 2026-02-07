import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const distDir = './dist';
const errors = [];

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

function checkLinks() {
  const htmlFiles = getAllHtmlFiles(distDir);
  const linkPattern = /href=["']([^"']+)["']/g;

  console.log(`Checking links in ${htmlFiles.length} HTML files...\n`);

  for (const file of htmlFiles) {
    const content = readFileSync(file, 'utf-8');
    const matches = [...content.matchAll(linkPattern)];

    for (const match of matches) {
      const link = match[1];

      // Skip external links, anchors, and special protocols
      if (link.startsWith('http') || link.startsWith('#') || link.startsWith('mailto:') || link.startsWith('tel:')) {
        continue;
      }

      // Check for broken internal links (missing leading slash or relative paths that look suspicious)
      if (!link.startsWith('/') && !link.startsWith('./') && !link.startsWith('../')) {
        if (link.includes('.html') || link.includes('.astro')) {
          errors.push(`${file}: Suspicious internal link "${link}"`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('❌ Link check failed:\n');
    errors.forEach(err => console.error(`  ${err}`));
    process.exit(1);
  } else {
    console.log('✅ All internal links look good!');
  }
}

checkLinks();
