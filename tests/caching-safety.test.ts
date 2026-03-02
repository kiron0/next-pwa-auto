import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config';
import { buildWorkboxOptions, createSWWebpackPlugin } from '../src/sw/webpack-plugin';
describe('caching safety', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-cache-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'cache-test', version: '1.0.0' })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  describe('API route caching', () => {
    it('defaults API routes to NetworkOnly', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      const apiCache = options.runtimeCaching.find((r: any) => r.options.cacheName === 'api-cache');
      expect(apiCache.handler).toBe('NetworkOnly');
    });
    it('allows overriding API cache strategy', () => {
      const config = resolveConfig({
        cacheStrategies: { api: 'networkFirst' },
      });
      const options = buildWorkboxOptions(config);
      const apiCache = options.runtimeCaching.find((r: any) => r.options.cacheName === 'api-cache');
      expect(apiCache.handler).toBe('NetworkFirst');
    });
    it('adds expiration when API strategy is not NetworkOnly', () => {
      const config = resolveConfig({
        cacheStrategies: { api: 'networkFirst' },
      });
      const options = buildWorkboxOptions(config);
      const apiCache = options.runtimeCaching.find((r: any) => r.options.cacheName === 'api-cache');
      expect(apiCache.options.expiration).toBeDefined();
      expect(apiCache.options.networkTimeoutSeconds).toBe(3);
    });
    it('does not add expiration when API strategy is NetworkOnly', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      const apiCache = options.runtimeCaching.find((r: any) => r.options.cacheName === 'api-cache');
      expect(apiCache.options.expiration).toBeUndefined();
    });
  });
  describe('security URL exclusions', () => {
    it('excludes auth-related URL patterns from caching', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      const regexExcludes = options.exclude.filter((p: any) => p instanceof RegExp);
      const securityPatterns = [
        /\/auth\//i,
        /\/callback/i,
        /\/token/i,
        /\/log-?in/i,
        /\/log-?out/i,
        /\/sign-?in/i,
        /\/sign-?out/i,
        /\/sign-?up/i,
        /\/oauth/i,
        /\/sso/i,
        /\/verify/i,
        /\/reset-?password/i,
        /\/forgot-?password/i,
        /\/session/i,
        /\/api\/auth/i,
      ];
      for (const pattern of securityPatterns) {
        const found = regexExcludes.some((r: RegExp) => r.source === pattern.source);
        expect(found, `Expected exclude pattern ${pattern.source} to be present`).toBe(true);
      }
    });
    it('excludes Next.js image optimization routes', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      const hasNextImage = options.exclude.some(
        (p: any) => p instanceof RegExp && p.source.includes('_next\\/image')
      );
      expect(hasNextImage).toBe(true);
    });
    it('preserves user-defined exclude patterns', () => {
      const customPattern = /\/my-custom-exclude/i;
      const config = resolveConfig({
        workbox: { exclude: [customPattern] },
      });
      const options = buildWorkboxOptions(config);
      const found = options.exclude.some(
        (p: any) => p instanceof RegExp && p.source === customPattern.source
      );
      expect(found).toBe(true);
    });
  });
  describe('static asset caching', () => {
    it('defaults /_next/static/* to CacheFirst', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      const staticCache = options.runtimeCaching.find(
        (r: any) => r.options.cacheName === 'static-assets-cache'
      );
      expect(staticCache.handler).toBe('CacheFirst');
    });
    it('sets 1 year expiry for static assets (immutable hashed files)', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      const staticCache = options.runtimeCaching.find(
        (r: any) => r.options.cacheName === 'static-assets-cache'
      );
      expect(staticCache.options.expiration.maxAgeSeconds).toBe(365 * 24 * 60 * 60);
    });
  });
  describe('image caching', () => {
    it('defaults images to StaleWhileRevalidate', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      const imageCache = options.runtimeCaching.find(
        (r: any) => r.options.cacheName === 'images-cache'
      );
      expect(imageCache.handler).toBe('StaleWhileRevalidate');
    });
  });
  describe('navigation preload', () => {
    it('enables navigation preload', () => {
      const config = resolveConfig();
      const options = buildWorkboxOptions(config);
      expect(options.navigationPreload).toBe(true);
    });
  });
  describe('NEXT_PWA env override', () => {
    it('enables SW in dev when NEXT_PWA=1', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalNextPwa = process.env.NEXT_PWA;
      process.env.NODE_ENV = 'development';
      process.env.NEXT_PWA = '1';
      const config = resolveConfig({ disableInDev: true });
      const plugin = createSWWebpackPlugin(config);
      expect(plugin).not.toBeNull();
      process.env.NODE_ENV = originalNodeEnv;
      process.env.NEXT_PWA = originalNextPwa;
    });
    it('disables SW in dev without NEXT_PWA env', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalNextPwa = process.env.NEXT_PWA;
      process.env.NODE_ENV = 'development';
      delete process.env.NEXT_PWA;
      const config = resolveConfig({ disableInDev: true });
      const plugin = createSWWebpackPlugin(config);
      expect(plugin).toBeNull();
      process.env.NODE_ENV = originalNodeEnv;
      if (originalNextPwa) process.env.NEXT_PWA = originalNextPwa;
    });
  });
});
