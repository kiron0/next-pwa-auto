import * as fs from 'fs';
import * as path from 'path';
import { getPublicDir } from '../config';
import { WebAppManifest } from '../types';

export function writeManifest(manifest: WebAppManifest, projectRoot: string): string {
  const publicDir = getPublicDir(projectRoot);
  const outputPath = path.join(publicDir, 'manifest.webmanifest');
  const existingManifest = readExistingManifest(publicDir);
  const finalManifest = existingManifest ? { ...manifest, ...existingManifest } : manifest;

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(finalManifest, null, 2), 'utf-8');

  return outputPath;
}

function readExistingManifest(publicDir: string): Record<string, any> | null {
  const candidates = ['manifest.json', 'manifest.webmanifest'];

  for (const filename of candidates) {
    const filePath = path.join(publicDir, filename);

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      } catch {
        continue;
      }
    }
  }
  return null;
}
