import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectRouterType,
  formatAppName,
  getPublicDir,
  getPwaOutputDir,
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
        JSON.stringify({ name: 'test-app', description: 'A test', version: '1.2.3' })
      );
      const info = readPackageJson(tmpDir);
      expect(info.name).toBe('test-app');
      expect(info.description).toBe('A test');
      expect(info.version).toBe('1.2.3');
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
        manifest: { name: 'Custom Name' },
      });
      expect(config.offline).toBe(false);
      expect(config.swDest).toBe('service-worker.js');
      expect(config.manifest.name).toBe('Custom Name');
      expect(config.disableInDev).toBe(true);
      expect(config.skipGeneratedIcons).toBe(true);
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
