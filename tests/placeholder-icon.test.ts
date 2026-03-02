import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config';
import { generateIcons } from '../src/icons/generator';
describe('placeholder icon generation', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-placeholder-'));
    fs.mkdirSync(path.join(tmpDir, 'public'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  it('generates placeholder when no source icon exists', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-test-app', version: '1.0.0' })
    );
    const config = resolveConfig();
    const result = await generateIcons(config);
    expect(result).not.toBeNull();
    expect(result.sourceIcon).toBe('placeholder');
  });
  it('generates all 10 icons from placeholder', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'placeholder-app', version: '1.0.0' })
    );
    const config = resolveConfig();
    const result = await generateIcons(config);
    expect(result.icons).toHaveLength(10);
  });
  it('placeholder icons are valid PNG files', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'png-test', version: '1.0.0' })
    );
    const config = resolveConfig();
    await generateIcons(config);
    const iconPath = path.join(tmpDir, 'public', '_pwa', 'icons', 'icon-192x192.png');
    expect(fs.existsSync(iconPath)).toBe(true);
    const metadata = await sharp(iconPath).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(192);
    expect(metadata.height).toBe(192);
  });
  it('generates initials from two-word app name', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'cool-project', version: '1.0.0' })
    );
    const config = resolveConfig();
    const result = await generateIcons(config);
    expect(result.sourceIcon).toBe('placeholder');
    expect(result.icons.length).toBe(10);
  });
  it('generates initials from single-word app name', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', version: '1.0.0' })
    );
    const config = resolveConfig();
    const result = await generateIcons(config);
    expect(result.sourceIcon).toBe('placeholder');
    expect(result.icons.length).toBe(10);
  });
  it('generates initials from scoped package name', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: '@org/my-app', version: '1.0.0' })
    );
    const config = resolveConfig();
    const result = await generateIcons(config);
    expect(result.sourceIcon).toBe('placeholder');
    expect(result.icons.length).toBe(10);
  });
  it('uses theme_color from manifest config as background', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'themed-app', version: '1.0.0' })
    );
    const config = resolveConfig({
      manifest: { theme_color: '#ff6b35' },
    });
    const result = await generateIcons(config);
    expect(result.sourceIcon).toBe('placeholder');
    const iconPath = path.join(tmpDir, 'public', '_pwa', 'icons', 'icon-512x512.png');
    const metadata = await sharp(iconPath).metadata();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });
  it('prefers source icon over placeholder when both could apply', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'has-icon', version: '1.0.0' })
    );
    const buffer = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(tmpDir, 'public', 'icon.png'), buffer);
    const config = resolveConfig();
    const result = await generateIcons(config);
    expect(result.sourceIcon).toContain('icon.png');
    expect(result.sourceIcon).not.toBe('placeholder');
  });
  it('creates _pwa/icons directory when generating placeholders', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'dir-test', version: '1.0.0' })
    );
    const iconsDir = path.join(tmpDir, 'public', '_pwa', 'icons');
    expect(fs.existsSync(iconsDir)).toBe(false);
    const config = resolveConfig();
    await generateIcons(config);
    expect(fs.existsSync(iconsDir)).toBe(true);
    const files = fs.readdirSync(iconsDir);
    expect(files.length).toBe(10);
  });
  it('generates both standard and maskable placeholder icons', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'maskable-test', version: '1.0.0' })
    );
    const config = resolveConfig();
    const result = await generateIcons(config);
    const standardIcons = result.icons.filter((i) => i.purpose === 'any');
    const maskableIcons = result.icons.filter((i) => i.purpose === 'maskable');
    expect(standardIcons).toHaveLength(8);
    expect(maskableIcons).toHaveLength(2);
    const maskableSizes = maskableIcons.map((i) => i.sizes);
    expect(maskableSizes).toContain('192x192');
    expect(maskableSizes).toContain('512x512');
  });
});
