import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectRouterType,
  formatAppName,
  getPublicDir,
  getPwaOutputDir,
  isNextProject,
  readPackageJson,
  resolveConfig,
} from '../src/config';
describe('config', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  describe('formatAppName', () => {
    it('converts kebab-case to title case', () => {
      expect(formatAppName('my-cool-app')).toBe('My Cool App');
    });
    it('converts snake_case to title case', () => {
      expect(formatAppName('my_cool_app')).toBe('My Cool App');
    });
    it('strips npm scope prefix', () => {
      expect(formatAppName('@org/my-package')).toBe('My Package');
    });
    it('handles single word', () => {
      expect(formatAppName('app')).toBe('App');
    });
    it('handles already capitalized input', () => {
      expect(formatAppName('MyApp')).toBe('MyApp');
    });
  });
  describe('readPackageJson', () => {
    it('reads name, description, version from package.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          description: 'A test',
          version: '1.2.3',
          keywords: ['pwa', 'nextjs', 123],
        })
      );
      const info = readPackageJson(tmpDir);
      expect(info.name).toBe('test-app');
      expect(info.description).toBe('A test');
      expect(info.version).toBe('1.2.3');
      expect(info.keywords).toEqual(['pwa', 'nextjs']);
    });
    it('falls back to folder name when package.json is missing', () => {
      const info = readPackageJson(tmpDir);
      expect(info.name).toBe(path.basename(tmpDir));
      expect(info.description).toBe('');
      expect(info.version).toBe('0.0.0');
    });
    it('falls back to folder name when name field is empty', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ description: 'A test' })
      );
      const info = readPackageJson(tmpDir);
      expect(info.name).toBe(path.basename(tmpDir));
    });

    it('parses package.json even when file includes UTF-8 BOM', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        `\uFEFF${JSON.stringify({
          name: 'bom-app',
          description: 'BOM test',
          version: '9.9.9',
        })}`
      );
      const info = readPackageJson(tmpDir);
      expect(info.name).toBe('bom-app');
      expect(info.description).toBe('BOM test');
      expect(info.version).toBe('9.9.9');
    });
  });
  describe('isNextProject', () => {
    it('returns true when next dependency exists', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'next-app',
          dependencies: { next: '14.0.0' },
        })
      );
      expect(isNextProject(tmpDir)).toBe(true);
    });

    it('returns true when package.json has UTF-8 BOM and next dependency exists', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        `\uFEFF${JSON.stringify({
          name: 'next-bom-app',
          dependencies: { next: '14.0.0' },
        })}`
      );
      expect(isNextProject(tmpDir)).toBe(true);
    });
  });
  describe('detectRouterType', () => {
    it('detects app router when /app exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'app'));
      expect(detectRouterType(tmpDir)).toBe('app');
    });
    it('detects app router when /src/app exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'app'), { recursive: true });
      expect(detectRouterType(tmpDir)).toBe('app');
    });
    it('detects pages router when /pages exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'pages'));
      expect(detectRouterType(tmpDir)).toBe('pages');
    });
    it('detects pages router when /src/pages exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'pages'), { recursive: true });
      expect(detectRouterType(tmpDir)).toBe('pages');
    });
    it('prefers App router when app and pages both exist', () => {
      fs.mkdirSync(path.join(tmpDir, 'app'));
      fs.mkdirSync(path.join(tmpDir, 'pages'));
      expect(detectRouterType(tmpDir)).toBe('app');
    });
    it('defaults to pages when neither exists', () => {
      expect(detectRouterType(tmpDir)).toBe('pages');
    });
  });
  describe('resolveConfig', () => {
    beforeEach(() => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-app', description: 'Test', version: '1.0.0' })
      );
    });
    it('returns defaults with no user config', () => {
      const config = resolveConfig();
      expect(config.disable).toBe(false);
      expect(config.offline).toBe(true);
      expect(config.icon).toBeNull();
      expect(config.icons.maskable).toBe(true);
      expect(config.icons.sizes).toEqual([72, 96, 128, 144, 152, 192, 384, 512]);
      expect(config.icons.themeVariants).toEqual([]);
      expect(config.skipGeneratedIcons).toBe(false);
      expect(config.pwaDir).toBe('_pwa');
      expect(config.disableInDev).toBe(true);
      expect(config.swDest).toBe('sw.js');
      expect(config.scope).toBe('/');
      expect(config.packageInfo.name).toBe('my-app');
    });
    it('merges user config with defaults', () => {
      const config = resolveConfig({
        offline: false,
        swDest: 'service-worker.js',
        skipGeneratedIcons: true,
        icons: {
          maskable: false,
          sizes: [512, 256, 16, 512],
          themeVariants: [
            { name: 'dark', themeColor: '#000' },
            { name: '', themeColor: '#fff' },
          ],
        },
        manifest: { name: 'Custom Name' },
      });
      expect(config.offline).toBe(false);
      expect(config.swDest).toBe('service-worker.js');
      expect(config.manifest.name).toBe('Custom Name');
      expect(config.disableInDev).toBe(true);
      expect(config.skipGeneratedIcons).toBe(true);
      expect(config.icons.maskable).toBe(false);
      expect(config.icons.sizes).toEqual([256, 512]);
      expect(config.icons.themeVariants).toEqual([{ name: 'dark', themeColor: '#000' }]);
    });
    it('merges cacheStrategies with defaults', () => {
      const config = resolveConfig({
        cacheStrategies: { images: 'networkFirst' },
      });
      expect(config.cacheStrategies.images).toBe('networkFirst');
      expect(config.cacheStrategies.navigation).toBe('networkFirst');
      expect(config.cacheStrategies.staticAssets).toBe('cacheFirst');
    });
    it('sets projectRoot to cwd', () => {
      const config = resolveConfig();
      expect(config.projectRoot).toBe(tmpDir);
    });

    it('uses NEXT_PWA_AUTO_ICON as runtime icon override', () => {
      const previousValue = process.env.NEXT_PWA_AUTO_ICON;
      process.env.NEXT_PWA_AUTO_ICON = 'public/icon.png';
      try {
        const config = resolveConfig();
        expect(config.icon).toBe('public/icon.png');
      } finally {
        if (previousValue === undefined) {
          delete process.env.NEXT_PWA_AUTO_ICON;
        } else {
          process.env.NEXT_PWA_AUTO_ICON = previousValue;
        }
      }
    });

    it('applies cache preset and include/exclude overrides', () => {
      const config = resolveConfig({
        preset: 'api-first',
        cacheStrategies: {
          staticAssets: 'networkFirst',
        },
        include: ['/api/**'],
        exclude: ['/api/auth/**'],
      });

      expect(config.preset).toBe('api-first');
      expect(config.cacheStrategies.navigation).toBe('networkFirst');
      expect(config.cacheStrategies.api).toBe('networkFirst');
      expect(config.cacheStrategies.staticAssets).toBe('networkFirst');
      expect(config.include).toEqual(['/api/**']);
      expect(config.exclude).toEqual(['/api/auth/**']);
    });
    it('supports all named cache presets', () => {
      const staticPreset = resolveConfig({ preset: 'static' });
      expect(staticPreset.preset).toBe('static');
      expect(staticPreset.cacheStrategies.navigation).toBe('networkFirst');
      expect(staticPreset.cacheStrategies.staticAssets).toBe('cacheFirst');
      expect(staticPreset.cacheStrategies.images).toBe('staleWhileRevalidate');
      expect(staticPreset.cacheStrategies.api).toBe('networkOnly');

      const apiFirstPreset = resolveConfig({ preset: 'api-first' });
      expect(apiFirstPreset.preset).toBe('api-first');
      expect(apiFirstPreset.cacheStrategies.api).toBe('networkFirst');
      expect(apiFirstPreset.cacheStrategies.staticAssets).toBe('staleWhileRevalidate');
      expect(apiFirstPreset.cacheStrategies.images).toBe('networkFirst');

      const readonlyPreset = resolveConfig({ preset: 'readonly' });
      expect(readonlyPreset.preset).toBe('readonly');
      expect(readonlyPreset.cacheStrategies.navigation).toBe('cacheOnly');
      expect(readonlyPreset.cacheStrategies.staticAssets).toBe('cacheOnly');
      expect(readonlyPreset.cacheStrategies.images).toBe('cacheOnly');
      expect(readonlyPreset.cacheStrategies.api).toBe('networkOnly');

      const offlineFirstPreset = resolveConfig({ preset: 'offline-first' });
      expect(offlineFirstPreset.preset).toBe('offline-first');
      expect(offlineFirstPreset.cacheStrategies.navigation).toBe('networkFirst');
      expect(offlineFirstPreset.cacheStrategies.staticAssets).toBe('cacheFirst');
      expect(offlineFirstPreset.cacheStrategies.images).toBe('staleWhileRevalidate');
      expect(offlineFirstPreset.cacheStrategies.api).toBe('networkOnly');
    });

    it('falls back to default preset with invalid preset input', () => {
      const config = resolveConfig({
        // @ts-expect-error testing fallback on invalid value
        preset: 'not-a-preset',
      });

      expect(config.preset).toBe('default');
      expect(config.cacheStrategies.navigation).toBe('networkFirst');
      expect(config.cacheStrategies.staticAssets).toBe('cacheFirst');
    });
  });
  describe('getPublicDir', () => {
    it('returns public directory path', () => {
      expect(getPublicDir('/my/project')).toBe(path.join('/my/project', 'public'));
    });
  });
  describe('getPwaOutputDir', () => {
    it('returns pwa output directory path', () => {
      const config = resolveConfig();
      const pwaDir = getPwaOutputDir(config);
      expect(pwaDir).toBe(path.join(tmpDir, 'public', '_pwa'));
    });
  });
});
