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
      JSON.stringify({ name: 'plugin-test', description: 'Testing', version: '1.0.0' })
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
});
