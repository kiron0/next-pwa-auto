import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withPWAAuto } from '../src/index';
describe('withPWAAuto plugin', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-plugin-'));
    fs.mkdirSync(path.join(tmpDir, 'public'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'plugin-test',
        description: 'Testing',
        version: '1.0.0',
        dependencies: { next: '14.0.0' },
      })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  it('withPWAAuto is a function', () => {
    expect(typeof withPWAAuto).toBe('function');
  });
  it('returns a function that accepts next.config', () => {
    const wrapper = withPWAAuto();
    expect(typeof wrapper).toBe('function');
    const config = wrapper({});
    expect(config).toBeDefined();
    expect(typeof config.webpack).toBe('function');
  });
  it('uses webpack by default when Next version is < 16', () => {
    const wrapper = withPWAAuto();
    const config = wrapper({});
    expect(typeof config.webpack).toBe('function');
    expect(config.turbopack).toBeUndefined();
  });
  it('uses turbopack for Next 16+ when no webpack flag is provided', () => {
    const originalArgv = [...process.argv];
    process.argv = ['node', 'next', 'build'];
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'plugin-test', version: '1.0.0', dependencies: { next: '16.1.0' } })
      );

      const wrapper = withPWAAuto();
      const config = wrapper({});
      expect(config.webpack).toBeUndefined();
      expect(config.turbopack).toBeDefined();
    } finally {
      process.argv = originalArgv;
    }
  });
  it('uses webpack when --webpack is explicitly set on Next 16+', () => {
    const originalArgv = [...process.argv];
    process.argv = ['node', 'next', 'build', '--webpack'];
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'plugin-test', version: '1.0.0', dependencies: { next: '16.1.0' } })
      );

      const wrapper = withPWAAuto();
      const config = wrapper({});
      expect(typeof config.webpack).toBe('function');
      expect(config.turbopack).toBeUndefined();
    } finally {
      process.argv = originalArgv;
    }
  });
  it('rejects using withPWAAuto outside a Next.js project', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'plugin-test', version: '1.0.0' })
    );
    expect(() => withPWAAuto()).toThrow(
      'next-pwa-auto only works in a Next.js project. Ensure Next.js is installed and run this from a Next.js app directory.'
    );
  });
  it('defaults to Turbopack on latest Next.js projects when no bundler flag is provided', async () => {
    const originalArgv = [...process.argv];
    process.argv = ['node', 'next', 'build'];
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'plugin-test',
          version: '1.0.0',
          devDependencies: { next: '^16.0.0' },
        })
      );

      const wrapper = withPWAAuto();
      const config = wrapper({});
      expect(config.webpack).toBeUndefined();
      expect(config.turbopack).toEqual({});
      expect(config.headers).toBeDefined();
      const headers = await config.headers!();
      expect(Array.isArray(headers)).toBe(true);
      expect(headers.some((h: { source: string }) => h.source === '/manifest.webmanifest')).toBe(
        true
      );
    } finally {
      process.argv = originalArgv;
    }
  });
  it('returns identity function when disabled', () => {
    const wrapper = withPWAAuto({ disable: true });
    const nextConfig = { reactStrictMode: true };
    const result = wrapper(nextConfig);
    expect(result).toBe(nextConfig);
  });
  it('preserves existing next.config properties', () => {
    const wrapper = withPWAAuto();
    const config = wrapper({
      reactStrictMode: true,
      images: { domains: ['example.com'] },
    });
    expect(config.reactStrictMode).toBe(true);
    expect(config.images).toEqual({ domains: ['example.com'] });
  });
  it('adds headers function for app router', async () => {
    const wrapper = withPWAAuto();
    const config = wrapper({});
    expect(config.headers).toBeDefined();
    expect(typeof config.headers).toBe('function');
    const headers = await config.headers!();
    expect(headers).toBeInstanceOf(Array);
    const manifestHeader = headers.find((h: any) => h.source === '/manifest.webmanifest');
    expect(manifestHeader).toBeDefined();
    const swHeader = headers.find((h: any) => h.source === '/sw.js');
    expect(swHeader).toBeDefined();
  });
  it('merges with existing headers', async () => {
    const wrapper = withPWAAuto();
    const config = wrapper({
      async headers() {
        return [{ source: '/api/:path*', headers: [{ key: 'X-Custom', value: 'test' }] }];
      },
    });
    const headers = await config.headers!();
    expect(headers.length).toBeGreaterThan(1);
    const customHeader = headers.find((h: any) => h.source === '/api/:path*');
    expect(customHeader).toBeDefined();
  });
  it('calls user webpack config when provided', () => {
    const userWebpack = vi.fn((config: any) => {
      config.customField = true;
      return config;
    });
    const wrapper = withPWAAuto();
    const config = wrapper({ webpack: userWebpack });
    const webpackConfig = config.webpack!({ plugins: [] }, { isServer: true, dev: false });
    expect(userWebpack).toHaveBeenCalled();
    expect(webpackConfig.customField).toBe(true);
  });
  it('skips SW plugin on server-side build', () => {
    const wrapper = withPWAAuto();
    const config = wrapper({});
    const webpackConfig = { plugins: [] as any[] };
    const result = config.webpack!(webpackConfig, { isServer: true, dev: false });
    expect(result.plugins).toHaveLength(0);
  });
  it('skips SW plugin in dev when disableInDev is true', () => {
    const wrapper = withPWAAuto({ disableInDev: true });
    const config = wrapper({});
    const webpackConfig = { plugins: [] as any[] };
    const result = config.webpack!(webpackConfig, { isServer: false, dev: true });
    expect(result.plugins).toHaveLength(0);
  });
  it('reuses existing generated icons when skipGeneratedIcons is enabled', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const logs: string[] = [];
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    const iconsDir = path.join(tmpDir, 'public', '_pwa', 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });
    const existingIconPath = path.join(iconsDir, 'legacy-icon.png');
    fs.writeFileSync(existingIconPath, 'existing-icon');

    try {
      const wrapper = withPWAAuto({ skipGeneratedIcons: true });
      const config = wrapper({});

      const headers = await config.headers!();
      expect(headers.length).toBeGreaterThan(0);
      expect(fs.existsSync(existingIconPath)).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'public', 'manifest.webmanifest'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'public', '_pwa', 'offline.html'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'public', '_pwa', 'sw-register.js'))).toBe(true);
      expect(fs.existsSync(existingIconPath)).toBe(true);
      expect(logs.join('\n')).toContain(
        '[next-pwa-auto] ' + String.fromCharCode(0x267A) + ' Reusing existing generated icons.'
      );
    } finally {
      consoleLogSpy.mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
