import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config';
import { generateIcons } from '../src/icons/generator';
import { ensureDir, findSourceIcon } from '../src/icons/utils';
describe('icons', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-icons-'));
    fs.mkdirSync(path.join(tmpDir, 'public'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'icon-test', version: '1.0.0' })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  describe('findSourceIcon', () => {
    it('returns null when no icon exists', () => {
      const result = findSourceIcon(path.join(tmpDir, 'public'));
      expect(result).toBeNull();
    });
    it('finds icon.svg as highest priority', () => {
      fs.writeFileSync(path.join(tmpDir, 'public', 'icon.svg'), '<svg></svg>');
      fs.writeFileSync(path.join(tmpDir, 'public', 'logo.png'), 'fake');
      const result = findSourceIcon(path.join(tmpDir, 'public'));
      expect(result).toContain('icon.svg');
    });
    it('finds icon.png', () => {
      fs.writeFileSync(path.join(tmpDir, 'public', 'icon.png'), 'fake-png');
      const result = findSourceIcon(path.join(tmpDir, 'public'));
      expect(result).toContain('icon.png');
    });
    it('finds logo.svg when no icon.* exists', () => {
      fs.writeFileSync(path.join(tmpDir, 'public', 'logo.svg'), '<svg></svg>');
      const result = findSourceIcon(path.join(tmpDir, 'public'));
      expect(result).toContain('logo.svg');
    });
    it('finds logo.png', () => {
      fs.writeFileSync(path.join(tmpDir, 'public', 'logo.png'), 'fake-png');
      const result = findSourceIcon(path.join(tmpDir, 'public'));
      expect(result).toContain('logo.png');
    });
    it('finds favicon.svg', () => {
      fs.writeFileSync(path.join(tmpDir, 'public', 'favicon.svg'), '<svg></svg>');
      const result = findSourceIcon(path.join(tmpDir, 'public'));
      expect(result).toContain('favicon.svg');
    });
  });
  describe('ensureDir', () => {
    it('creates directory if it does not exist', () => {
      const dir = path.join(tmpDir, 'nested', 'deep', 'dir');
      ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });
    it('does not throw if directory already exists', () => {
      const dir = path.join(tmpDir, 'existing');
      fs.mkdirSync(dir);
      expect(() => ensureDir(dir)).not.toThrow();
    });
  });
  describe('generateIcons', () => {
    async function createTestIcon(publicDir: string): Promise<void> {
      const buffer = await sharp({
        create: {
          width: 512,
          height: 512,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      fs.writeFileSync(path.join(publicDir, 'icon.png'), buffer);
    }
    it('generates placeholder icons when no source icon is found', async () => {
      const config = resolveConfig();
      const result = await generateIcons(config);
      expect(result).not.toBeNull();
      expect(result!.sourceIcon).toBe('placeholder');
      expect(result!.icons).toHaveLength(10);
    });
    it('generates all standard icon sizes', async () => {
      await createTestIcon(path.join(tmpDir, 'public'));
      const config = resolveConfig();
      const result = await generateIcons(config);
      expect(result).not.toBeNull();
      expect(result.icons).toHaveLength(10);
    });
    it('generates icons in correct output directory', async () => {
      await createTestIcon(path.join(tmpDir, 'public'));
      const config = resolveConfig();
      await generateIcons(config);
      const iconsDir = path.join(tmpDir, 'public', '_pwa', 'icons');
      expect(fs.existsSync(iconsDir)).toBe(true);
      const files = fs.readdirSync(iconsDir);
      expect(files).toContain('icon-192x192.png');
      expect(files).toContain('icon-512x512.png');
      expect(files).toContain('icon-192x192-maskable.png');
      expect(files).toContain('icon-512x512-maskable.png');
    });
    it('generates icons with correct sizes', async () => {
      await createTestIcon(path.join(tmpDir, 'public'));
      const config = resolveConfig();
      await generateIcons(config);
      const icon192 = path.join(tmpDir, 'public', '_pwa', 'icons', 'icon-192x192.png');
      const metadata = await sharp(icon192).metadata();
      expect(metadata.width).toBe(192);
      expect(metadata.height).toBe(192);
    });
    it('returns correct manifest icon entries', async () => {
      await createTestIcon(path.join(tmpDir, 'public'));
      const config = resolveConfig();
      const result = await generateIcons(config);
      const anyIcons = result!.icons.filter((i) => i.purpose === 'any');
      const maskableIcons = result!.icons.filter((i) => i.purpose === 'maskable');
      expect(anyIcons).toHaveLength(8);
      expect(maskableIcons).toHaveLength(2);
      for (const icon of result!.icons) {
        expect(icon.type).toBe('image/png');
        expect(icon.src).toMatch(/^\/_pwa\/icons\/icon-\d+x\d+(-maskable)?\.png$/);
      }
    });
    it('supports disabling maskable icon generation', async () => {
      await createTestIcon(path.join(tmpDir, 'public'));
      const config = resolveConfig({
        icons: {
          maskable: false,
        },
      });
      const result = await generateIcons(config);
      const maskableIcons = result.icons.filter((i) => i.purpose === 'maskable');
      expect(maskableIcons).toHaveLength(0);
      expect(result.icons).toHaveLength(8);
    });
    it('supports custom icon size lists', async () => {
      await createTestIcon(path.join(tmpDir, 'public'));
      const config = resolveConfig({
        icons: {
          sizes: [96, 256, 512],
        },
      });
      const result = await generateIcons(config);
      const anySizes = result.icons.filter((i) => i.purpose === 'any').map((i) => i.sizes);
      expect(anySizes).toEqual(['96x96', '256x256', '512x512']);
      const maskableSizes = result.icons.filter((i) => i.purpose === 'maskable').map((i) => i.sizes);
      expect(maskableSizes).toEqual(['512x512']);
    });
    it('generates optional placeholder theme variants when source icon is missing', async () => {
      const config = resolveConfig({
        icons: {
          themeVariants: [
            { name: 'light', themeColor: '#f1f5f9' },
            { name: 'dark', themeColor: '#0f172a' },
          ],
        },
      });
      const result = await generateIcons(config);
      const sources = result.icons.map((icon) => icon.src);
      expect(sources.some((src) => src.includes('-light.png'))).toBe(true);
      expect(sources.some((src) => src.includes('-dark.png'))).toBe(true);
      expect(result.icons).toHaveLength(30);
    });
    it('uses config.icon path when provided', async () => {
      const customDir = path.join(tmpDir, 'assets');
      fs.mkdirSync(customDir, { recursive: true });
      const buffer = await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 4,
          background: { r: 0, g: 0, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      fs.writeFileSync(path.join(customDir, 'custom-logo.png'), buffer);
      const config = resolveConfig({ icon: './assets/custom-logo.png' });
      const result = await generateIcons(config);
      expect(result).not.toBeNull();
      expect(result!.sourceIcon).toContain('custom-logo.png');
    });
    it('generates favicon.ico from source icon', async () => {
      const customDir = path.join(tmpDir, 'assets');
      fs.mkdirSync(customDir, { recursive: true });
      const buffer = await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 4,
          background: { r: 255, g: 0, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      fs.writeFileSync(path.join(customDir, 'custom-logo.png'), buffer);
      const config = resolveConfig({ icon: './assets/custom-logo.png' });

      await generateIcons(config);

      const faviconPath = path.join(tmpDir, 'public', 'favicon.ico');
      expect(fs.existsSync(faviconPath)).toBe(true);
      const stats = fs.statSync(faviconPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('does not overwrite existing public/favicon.ico', async () => {
      const customDir = path.join(tmpDir, 'assets');
      fs.mkdirSync(customDir, { recursive: true });
      const buffer = await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 4,
          background: { r: 255, g: 255, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      fs.writeFileSync(path.join(tmpDir, 'public', 'favicon.ico'), 'existing-favicon');
      fs.writeFileSync(path.join(customDir, 'custom-logo.png'), buffer);
      const config = resolveConfig({ icon: './assets/custom-logo.png' });

      await generateIcons(config);

      expect(fs.readFileSync(path.join(tmpDir, 'public', 'favicon.ico'), 'utf-8')).toBe(
        'existing-favicon'
      );
    });

    it('does not generate public/favicon.ico when app/favicon.ico exists', async () => {
      const customDir = path.join(tmpDir, 'assets');
      fs.mkdirSync(customDir, { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
      const appFaviconPath = path.join(tmpDir, 'app', 'favicon.ico');
      fs.writeFileSync(appFaviconPath, 'app-favicon');

      const buffer = await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 4,
          background: { r: 0, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      fs.writeFileSync(path.join(customDir, 'custom-logo.png'), buffer);
      const config = resolveConfig({ icon: './assets/custom-logo.png' });

      await generateIcons(config);

      const publicFavicon = path.join(tmpDir, 'public', 'favicon.ico');
      expect(fs.existsSync(publicFavicon)).toBe(false);
      expect(fs.readFileSync(appFaviconPath, 'utf-8')).toBe('app-favicon');
    });
  });
});
