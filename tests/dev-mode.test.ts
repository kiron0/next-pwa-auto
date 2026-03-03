import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config';
import { getSWRegisterScript } from '../src/sw/register';
import { createSWWebpackPlugin } from '../src/sw/webpack-plugin';
describe('dev mode behavior', () => {
  describe('SW register script features', () => {
    it('includes SKIP_WAITING message handler', () => {
      const script = getSWRegisterScript();
      expect(script).toContain('SKIP_WAITING');
    });
    it('exposes __PWA_AUTO.update() method', () => {
      const script = getSWRegisterScript();
      expect(script).toContain('update: function()');
      expect(script).toContain('registration.update()');
    });
    it('exposes __PWA_AUTO.skipWaiting() method', () => {
      const script = getSWRegisterScript();
      expect(script).toContain('skipWaiting: function()');
      expect(script).toContain("postMessage({ type: 'SKIP_WAITING' })");
    });
    it('includes controller change dedup guard', () => {
      const script = getSWRegisterScript();
      expect(script).toContain('var refreshing = false');
      expect(script).toContain('if (refreshing) return');
    });
    it('checks for waiting worker before skipWaiting', () => {
      const script = getSWRegisterScript();
      expect(script).toContain('if (registration.waiting)');
    });
  });
  describe('PWAHead dev mode auto-unregister', () => {
    let mockGetRegistrations: ReturnType<typeof vi.fn>;
    let mockUnregister: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      mockUnregister = vi.fn().mockResolvedValue(true);
      mockGetRegistrations = vi.fn().mockResolvedValue([{ unregister: mockUnregister }]);
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          getRegistrations: mockGetRegistrations,
          addEventListener: vi.fn(),
        },
        configurable: true,
        writable: true,
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it('calls getRegistrations in dev mode via PWAHead', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const { default: PWAHead } = await import('../src/head');
      const { render, cleanup } = await import('@testing-library/react');
      const React = await import('react');
      render(React.createElement(PWAHead));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockGetRegistrations).toHaveBeenCalled();
      cleanup();
      process.env.NODE_ENV = originalEnv;
    });
    it('calls unregister on stale registrations in dev mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const { default: PWAHead } = await import('../src/head');
      const { render, cleanup } = await import('@testing-library/react');
      const React = await import('react');
      render(React.createElement(PWAHead));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockUnregister).toHaveBeenCalled();
      cleanup();
      process.env.NODE_ENV = originalEnv;
    });
  });
  describe('NEXT_PWA environment variable', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-dev-'));
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'dev-test', version: '1.0.0' })
      );
    });
    afterEach(() => {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
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

