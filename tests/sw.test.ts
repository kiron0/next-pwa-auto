import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config';
import { generateSWRegisterFile, getSWRegisterScript } from '../src/sw/register';
import { buildWorkboxOptions, createSWWebpackPlugin } from '../src/sw/webpack-plugin';
describe('service worker', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-sw-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'sw-test', version: '1.0.0' })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  describe('buildWorkboxOptions', () => {
    it('returns correct swDest', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      expect(options.swDest).toBe('sw.js');
    });
    it('sets skipWaiting and clientsClaim to true by default', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      expect(options.skipWaiting).toBe(true);
      expect(options.clientsClaim).toBe(true);
    });
    it('creates runtime caching rules for all route types', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      expect(options.runtimeCaching).toHaveLength(6);
      const cacheNames = options.runtimeCaching.map((r: any) => r.options.cacheName);
      expect(cacheNames).toContain('pages-cache');
      expect(cacheNames).toContain('static-assets-cache');
      expect(cacheNames).toContain('next-data-cache');
      expect(cacheNames).toContain('images-cache');
      expect(cacheNames).toContain('fonts-cache');
      expect(cacheNames).toContain('api-cache');
    });
    it('uses correct default handlers for each cache', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      const findByCache = (name: string) =>
        options.runtimeCaching.find((r: any) => r.options.cacheName === name);
      expect(findByCache('pages-cache').handler).toBe('NetworkFirst');
      expect(findByCache('static-assets-cache').handler).toBe('CacheFirst');
      expect(findByCache('images-cache').handler).toBe('StaleWhileRevalidate');
      expect(findByCache('fonts-cache').handler).toBe('CacheFirst');
      expect(findByCache('api-cache').handler).toBe('NetworkOnly');
    });
    it('respects custom cache strategy overrides', () => {
      const config = resolveConfig({
        cacheStrategies: {
          navigation: 'cacheFirst',
          images: 'networkOnly',
        },
      });
      const options = buildWorkboxOptions(config);
      const findByCache = (name: string) =>
        options.runtimeCaching.find((r: any) => r.options.cacheName === name);
      expect(findByCache('pages-cache').handler).toBe('CacheFirst');
      expect(findByCache('images-cache').handler).toBe('NetworkOnly');
    });
    it('includes exclude patterns', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      expect(options.exclude).toBeDefined();
      expect(options.exclude.length).toBeGreaterThanOrEqual(3);
    });
    it('adds offline page to additionalManifestEntries when offline is enabled', () => {
      const config = resolveConfig({ offline: true });
      const options = buildWorkboxOptions(config);
      expect(options.additionalManifestEntries).toBeDefined();
      const offlineEntry = options.additionalManifestEntries.find(
        (e: any) => e.url === '/_pwa/offline.html'
      );
      expect(offlineEntry).toBeDefined();
    });
    it('does not add offline page when offline is disabled', () => {
      const config = resolveConfig({ offline: false });
      const options = buildWorkboxOptions(config);
      const hasOffline = options.additionalManifestEntries?.some((e: any) =>
        e.url.includes('offline')
      );
      expect(hasOffline).toBeFalsy();
    });
    it('respects custom maximumFileSizeToCacheInBytes', () => {
      const config = resolveConfig({
        workbox: { maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 },
      });
      const options = buildWorkboxOptions(config);
      expect(options.maximumFileSizeToCacheInBytes).toBe(10 * 1024 * 1024);
    });
    it('includes additionalManifestEntries when provided', () => {
      const config = resolveConfig({
        workbox: {
          additionalManifestEntries: [{ url: '/custom-page', revision: '1' }],
        },
      });
      const options = buildWorkboxOptions(config);
      const custom = options.additionalManifestEntries.find((e: any) => e.url === '/custom-page');
      expect(custom).toBeDefined();
    });
  });
  describe('createSWWebpackPlugin', () => {
    it('returns a GenerateSW plugin instance in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const config = resolveConfig();
      const plugin = createSWWebpackPlugin(config);
      expect(plugin).not.toBeNull();
      process.env.NODE_ENV = originalEnv;
    });
    it('returns null in dev when disableInDev is true', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const config = resolveConfig({ disableInDev: true });
      const plugin = createSWWebpackPlugin(config);
      expect(plugin).toBeNull();
      process.env.NODE_ENV = originalEnv;
    });
  });
  describe('SW register script', () => {
    it('generates register script with correct sw path', () => {
      const script = getSWRegisterScript('/sw.js', '/');
      expect(script).toContain("register('/sw.js'");
      expect(script).toContain("scope: '/'");
    });
    it('generates register script with custom sw path', () => {
      const script = getSWRegisterScript('/custom-sw.js', '/app/');
      expect(script).toContain("register('/custom-sw.js'");
      expect(script).toContain("scope: '/app/'");
    });
    it('includes service worker feature detection', () => {
      const script = getSWRegisterScript();
      expect(script).toContain("'serviceWorker' in navigator");
    });
    it('includes update handler', () => {
      const script = getSWRegisterScript();
      expect(script).toContain('updatefound');
      expect(script).toContain('pwa-update-available');
    });
    it('exposes __PWA_AUTO on window', () => {
      const script = getSWRegisterScript();
      expect(script).toContain('__PWA_AUTO');
    });
    it('generates wrapped file content', () => {
      const content = generateSWRegisterFile('/sw.js', '/');
      expect(content).toContain('(function()');
      expect(content).toContain("register('/sw.js'");
    });
  });
});
