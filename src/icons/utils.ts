import * as fs from 'fs';
import * as path from 'path';

const SOURCE_ICON_NAMES = [
  'icon.svg',
  'icon.png',
  'logo.svg',
  'logo.png',
  'favicon.svg',
  'favicon.png',
  'app-icon.svg',
  'app-icon.png',
];

export function findSourceIcon(publicDir: string): string | null {
  for (const name of SOURCE_ICON_NAMES) {
    const iconPath = path.join(publicDir, name);
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }
  return null;
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
