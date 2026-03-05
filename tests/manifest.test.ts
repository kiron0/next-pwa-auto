import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config';
import { generateManifest } from '../src/manifest/generator';
import { writeManifest } from '../src/manifest/writer';
import { ManifestIcon } from '../src/types';
describe('manifest', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-manifest-'));
    fs.mkdirSync(path.join(tmpDir, 'public'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-cool-app', description: 'A cool app', version: '2.0.0' })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  describe('generateManifest', () => {
    it('adds installability metadata defaults', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: '@scope/Progressive App',
          description: 'App description',
          keywords: ['PWA', 'Productivity', 'pwa'],
        })
      );
      const config = resolveConfig();
      const manifest = generateManifest(config, []);
      expect(manifest.id).toBe('/progressive-app');
      expect(manifest.categories).toEqual(['pwa', 'productivity']);
      expect(manifest.shortcuts).toEqual([]);
      expect(manifest.screenshots).toEqual([]);
      expect(manifest.description).toBe('App description');
    });

    it('generates manifest with correct defaults', () => {
      const config = resolveConfig();
      const icons: ManifestIcon[] = [];
      const manifest = generateManifest(config, icons);
      expect(manifest.name).toBe('My Cool App');
      expect(manifest.short_name).toBe('My Cool App');
      expect(manifest.description).toBe('A cool app');
      expect(manifest.start_url).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.background_color).toBe('#ffffff');
      expect(manifest.theme_color).toBe('#000000');
      expect(manifest.orientation).toBe('any');
      expect(manifest.icons).toEqual([]);
    });
    it('truncates short_name to 12 characters for long names', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-very-long-application-name' })
      );
      const config = resolveConfig();
      const manifest = generateManifest(config, []);
      expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    });
    it('uses fallback description when missing', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app' }));
      const config = resolveConfig();
      const manifest = generateManifest(config, []);
      expect(manifest.description).toContain('Progressive Web App');
    });
    it('includes provided icons', () => {
      const config = resolveConfig();
      const icons: ManifestIcon[] = [
        {
          src: '/_pwa/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/_pwa/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
      ];
      const manifest = generateManifest(config, icons);
      expect(manifest.icons).toHaveLength(2);
      expect(manifest.icons[0].sizes).toBe('192x192');
      expect(manifest.icons[1].sizes).toBe('512x512');
    });
    it('deep merges user manifest overrides', () => {
      const config = resolveConfig({
        manifest: {
          name: 'Custom App Name',
          theme_color: '#ff6b35',
          display: 'fullscreen',
        },
      });
      const manifest = generateManifest(config, []);
      expect(manifest.name).toBe('Custom App Name');
      expect(manifest.theme_color).toBe('#ff6b35');
      expect(manifest.display).toBe('fullscreen');
      expect(manifest.background_color).toBe('#ffffff');
      expect(manifest.start_url).toBe('/');
    });
  });
  describe('writeManifest', () => {
    it('writes manifest.webmanifest to public directory', () => {
      const config = resolveConfig();
      const manifest = generateManifest(config, []);
      const outputPath = writeManifest(manifest, tmpDir);
      expect(fs.existsSync(outputPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content.name).toBe('My Cool App');
      expect(content.display).toBe('standalone');
    });
    it('merges with existing user manifest.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'public', 'manifest.json'),
        JSON.stringify({ name: 'User App', custom_field: 'hello' })
      );
      const config = resolveConfig();
      const manifest = generateManifest(config, []);
      const outputPath = writeManifest(manifest, tmpDir);
      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content.name).toBe('User App');
      expect(content.custom_field).toBe('hello');
      expect(content.start_url).toBe('/');
    });
    it('creates public directory if it does not exist', () => {
      const newTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-nopublic-'));
      vi.spyOn(process, 'cwd').mockReturnValue(newTmpDir);
      fs.writeFileSync(path.join(newTmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
      const config = resolveConfig();
      const manifest = generateManifest(config, []);
      const outputPath = writeManifest(manifest, newTmpDir);
      expect(fs.existsSync(outputPath)).toBe(true);
      fs.rmSync(newTmpDir, { recursive: true, force: true });
    });
  });
});
