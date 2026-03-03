import * as fs from 'node:fs';
import * as path from 'node:path';

export type RouterType = 'app' | 'pages';

export const NEXT_CONFIG_FILES = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.mts'];
export const APP_LAYOUT_FILES = ['layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js'];
export const PAGES_APP_FILES = ['_app.tsx', '_app.jsx', '_app.ts', '_app.js'];
export const APP_LAYOUT_PATH_HINT =
  'app/layout.(ts|tsx|js|jsx) (or src/app/layout.(ts|tsx|js|jsx))';
export const PWA_ICONS_PATH = path.join('public', '_pwa', 'icons');
export const PWA_ICONS_PATH_PRETTY = 'public/_pwa/icons';

export function findNextConfigFile(projectRoot: string): string | null {
  return NEXT_CONFIG_FILES.find((filename) => fs.existsSync(path.join(projectRoot, filename))) || null;
}

export function findTopLevelAppLayout(projectRoot: string): string | null {
  const appRoots = [path.join(projectRoot, 'app'), path.join(projectRoot, 'src', 'app')];
  for (const appRoot of appRoots) {
    for (const file of APP_LAYOUT_FILES) {
      const candidate = path.join(appRoot, file);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export function findTopLevelPagesLayout(projectRoot: string): string | null {
  const pageRoots = [path.join(projectRoot, 'pages'), path.join(projectRoot, 'src', 'pages')];
  for (const pageRoot of pageRoots) {
    for (const file of PAGES_APP_FILES) {
      const candidate = path.join(pageRoot, file);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export function hasPWAHeadInFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  return /<PWAHead\s*\/?>/.test(content) || /PWAHead/.test(content);
}

export function hasGeneratedPwaIcons(projectRoot: string): boolean {
  const iconsDir = path.join(projectRoot, PWA_ICONS_PATH);
  if (!fs.existsSync(iconsDir)) {
    return false;
  }
  return fs.readdirSync(iconsDir).some((file) => file.endsWith('.png'));
}
