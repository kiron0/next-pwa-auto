import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config';
import { generateOfflinePage } from '../src/offline/fallback';
describe('offline fallback', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-offline-'));
    fs.mkdirSync(path.join(tmpDir, 'public'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'offline-test', version: '1.0.0' })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  it('returns null when offline is disabled', () => {
    const config = resolveConfig({ offline: false });
    const result = generateOfflinePage(config);
    expect(result).toBeNull();
  });
  it('generates offline.html in _pwa directory', () => {
    const config = resolveConfig({ offline: true });
    const result = generateOfflinePage(config);
    expect(result).not.toBeNull();
    expect(fs.existsSync(result!)).toBe(true);
    expect(result).toContain(path.join('_pwa', 'offline.html'));
  });
  it('generates valid HTML content', () => {
    const config = resolveConfig({ offline: true });
    const result = generateOfflinePage(config);
    const html = fs.readFileSync(result!, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain("You're offline");
  });
  it('includes app name in the title', () => {
    const config = resolveConfig({ offline: true });
    const result = generateOfflinePage(config);
    const html = fs.readFileSync(result!, 'utf-8');
    expect(html).toContain('<title>Offline — offline-test</title>');
  });
  it('includes dark mode support', () => {
    const config = resolveConfig({ offline: true });
    const result = generateOfflinePage(config);
    const html = fs.readFileSync(result!, 'utf-8');
    expect(html).toContain('prefers-color-scheme: dark');
  });
  it('includes a retry button', () => {
    const config = resolveConfig({ offline: true });
    const result = generateOfflinePage(config);
    const html = fs.readFileSync(result!, 'utf-8');
    expect(html).toContain('Try again');
    expect(html).toContain('window.location.reload()');
  });
  it('includes WiFi-off icon SVG', () => {
    const config = resolveConfig({ offline: true });
    const result = generateOfflinePage(config);
    const html = fs.readFileSync(result!, 'utf-8');
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox');
  });
  it('uses custom offline page when _offline.html exists', () => {
    const customContent = '<html><body>Custom Offline</body></html>';
    fs.writeFileSync(path.join(tmpDir, 'public', '_offline.html'), customContent);
    const config = resolveConfig({ offline: true });
    const result = generateOfflinePage(config);
    const html = fs.readFileSync(result!, 'utf-8');
    expect(html).toBe(customContent);
  });
  it('creates _pwa directory if it does not exist', () => {
    const config = resolveConfig({ offline: true });
    const pwaDir = path.join(tmpDir, 'public', '_pwa');
    expect(fs.existsSync(pwaDir)).toBe(false);
    generateOfflinePage(config);
    expect(fs.existsSync(pwaDir)).toBe(true);
  });
});
