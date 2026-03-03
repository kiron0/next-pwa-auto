import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { runInit } from '../src/cli/init';

function createTempCommand(commandDir: string, command: string, logFile: string): void {
  const isWindows = process.platform === 'win32';
  const scriptPath = path.join(commandDir, isWindows ? `${command}.cmd` : command);
  const scriptContent = isWindows
    ? ['@echo off', `echo %~n0 %*>>"${logFile.replace(/"/g, '""')}"`, 'exit /b 0'].join('\r\n')
    : ['#!/bin/sh', `printf '%s %s\\n' "$(basename "$0")" "$*" >> "${logFile}"`].join('\n');

  writeFileSync(scriptPath, scriptContent, 'utf-8');
  if (!isWindows) {
    chmodSync(scriptPath, 0o755);
  }
}

describe('init command', () => {
  let projectRoot = '';
  let commandLog = '';
  let commandDir = '';
  let originalPath = '';
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

  const createProject = (): string => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'next-pwa-auto-init-'));
    mkdirSync(path.join(dir, 'public'), { recursive: true });
    return dir;
  };

  const createMockCommands = (root: string): void => {
    commandDir = path.join(root, '.mock-bin');
    mkdirSync(commandDir, { recursive: true });
    commandLog = path.join(root, 'commands.log');
    ['bun', 'pnpm', 'yarn', 'npm', 'next', 'npx'].forEach((cmd) => {
      createTempCommand(commandDir, cmd, commandLog);
    });
  };

  const readCommandLog = (): string[] => {
    if (!existsSync(commandLog)) {
      return [];
    }
    const content = readFileSync(commandLog, 'utf-8').trim();
    if (!content) {
      return [];
    }
    return content.split(/\r?\n/).filter(Boolean);
  };

  beforeEach(() => {
    projectRoot = createProject();
    createMockCommands(projectRoot);
    originalPath = process.env.PATH ?? '';
    process.env.PATH = `${commandDir}${path.delimiter}${originalPath}`;
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
  });

  afterEach(() => {
    if (cwdSpy) {
      cwdSpy.mockRestore();
    }
    process.env.PATH = originalPath;
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('uses packageManager from package.json for installation command', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'demo',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
          },
          packageManager: 'bun@1.2.0',
        },
        null,
        2
      )
    );

    writeFileSync(path.join(projectRoot, 'bun.lockb'), 'mock');

    await runInit({ skip: true, force: true });

    expect(readCommandLog()).toEqual([
      'bun add next-pwa-auto',
      'bun run build',
      'npx next-pwa-auto doctor',
    ]);

    const configPath = path.join(projectRoot, 'next.config.mjs');
    expect(existsSync(configPath)).toBe(true);
    const config = readFileSync(configPath, 'utf-8');
    expect(config).toContain("import withPWAAuto from 'next-pwa-auto';");
    expect(config).toContain('withPWAAuto()(nextConfig)');
  });

  it('reuses existing installation and updates config and layout in init flow', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'app',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
            'next-pwa-auto': '^0.1.1',
          },
        },
        null,
        2
      )
    );

    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');
    writeFileSync(
      path.join(projectRoot, 'next.config.js'),
      'const nextConfig = {}\nmodule.exports = nextConfig\n'
    );

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout() { return <html><head></head><body></body></html> }'
    );

    await runInit({ skip: true, force: true });

    expect(readCommandLog()).toEqual(['npm run build', 'npx next-pwa-auto doctor']);

    const config = readFileSync(path.join(projectRoot, 'next.config.js'), 'utf-8');
    expect(config).toContain("const withPWAAuto = require('next-pwa-auto').default;");
    expect(config).toContain('module.exports = withPWAAuto()(nextConfig);');

    const layout = readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf-8');
    expect(layout).toContain("import PWAHead from 'next-pwa-auto/head';");
    expect(layout).toContain('<PWAHead />');
  });

  it('refuses to run in non-Next.js projects', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'not-next-app',
          version: '1.0.0',
        },
        null,
        2
      )
    );

    await expect(runInit(true)).rejects.toThrow(
      'next-pwa-auto init can only be used in a Next.js project.'
    );
  });

  it('adds a new <head> block when none exists in app layout', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'headless-layout-app',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
            'next-pwa-auto': '^0.1.1',
          },
        },
        null,
        2
      )
    );

    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');
    writeFileSync(
      path.join(projectRoot, 'next.config.mjs'),
      'const nextConfig = {};\nexport default nextConfig;\n'
    );

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      "export default function RootLayout({ children }) { return <html lang='en'><body>{children}</body></html> }"
    );

    await runInit({ skip: true, force: true });

    const layout = readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf-8');
    expect(layout).toContain('<head>');
    expect(layout).toContain('<PWAHead />');
    expect(layout.indexOf('<head>')).toBeLessThan(layout.indexOf('<body'));
  });

  it('adds a <head> block before body when no <head> and no <html> are present', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'no-html-layout-app',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
            'next-pwa-auto': '^0.1.1',
          },
        },
        null,
        2
      )
    );

    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');
    writeFileSync(
      path.join(projectRoot, 'next.config.mjs'),
      'const nextConfig = {};\nexport default nextConfig;\n'
    );

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <body>{children}</body> }'
    );

    await runInit({ skip: true, force: true });

    const layout = readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf-8');
    expect(layout).toContain('<head>');
    expect(layout).toContain('<PWAHead />');
    expect(layout.indexOf('<head>')).toBeLessThan(layout.indexOf('<body'));
  });

  it('auto-injects <PWAHead /> into pages/_app when using Pages Router', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'pages-router-app',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
            'next-pwa-auto': '^0.1.1',
          },
        },
        null,
        2
      )
    );

    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');
    writeFileSync(
      path.join(projectRoot, 'next.config.js'),
      'const nextConfig = {}\nmodule.exports = nextConfig\n'
    );

    mkdirSync(path.join(projectRoot, 'pages'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'pages', '_app.tsx'),
      [
        'export default function App({ Component, pageProps }) {',
        '  return <Component {...pageProps} />;',
        '}',
        '',
      ].join('\n')
    );

    await runInit({ skip: true, force: true });

    expect(readCommandLog()).toEqual(['npm run build', 'npx next-pwa-auto doctor']);

    const pagesApp = readFileSync(path.join(projectRoot, 'pages', '_app.tsx'), 'utf-8');
    expect(pagesApp).toContain("import PWAHead from 'next-pwa-auto/head';");
    expect(pagesApp).toContain('<PWAHead />');
    expect(pagesApp).toContain('<Component {...pageProps} />');
  });

  it('prioritizes top-level app layout file when nested layouts exist', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'nested-layout-app',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
            'next-pwa-auto': '^0.1.1',
          },
        },
        null,
        2
      )
    );

    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');
    writeFileSync(
      path.join(projectRoot, 'next.config.mjs'),
      'const nextConfig = {};\nexport default nextConfig;\n'
    );

    mkdirSync(path.join(projectRoot, 'app', '(dashboard)', 'analytics'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', '(dashboard)', 'analytics', 'layout.tsx'),
      'export default function NestedLayout({ children }) { return <html><body>{children}</body></html> }'
    );

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html> }'
    );

    await runInit({ skip: true, force: true });

    const topLayout = readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf-8');
    const nestedLayout = readFileSync(
      path.join(projectRoot, 'app', '(dashboard)', 'analytics', 'layout.tsx'),
      'utf-8'
    );

    expect(topLayout).toContain("import PWAHead from 'next-pwa-auto/head';");
    expect(topLayout).toContain('<PWAHead />');
    expect(nestedLayout).not.toContain("import PWAHead from 'next-pwa-auto/head';");
  });

  it('keeps existing config and layout untouched when already configured', async () => {
    const nextConfigContent = [
      "import withPWAAuto from 'next-pwa-auto';",
      '',
      'const nextConfig = {};',
      '',
      'export default withPWAAuto()(nextConfig);',
      '',
    ].join('\n');
    const layoutContent = [
      "import PWAHead from 'next-pwa-auto/head';",
      '',
      'export default function RootLayout() {',
      '  return (',
      '    <html>',
      '      <head>',
      '        <PWAHead />',
      '      </head>',
      '      <body />',
      '    </html>',
      '  );',
      '}',
      '',
    ].join('\n');

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'configured-app',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
            'next-pwa-auto': '^0.1.1',
          },
        },
        null,
        2
      )
    );
    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');
    writeFileSync(path.join(projectRoot, 'next.config.mjs'), nextConfigContent);

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'app', 'layout.tsx'), layoutContent);

    await runInit({ skip: true, force: true });

    expect(readCommandLog()).toEqual(['npm run build', 'npx next-pwa-auto doctor']);
    expect(readFileSync(path.join(projectRoot, 'next.config.mjs'), 'utf-8')).toBe(
      nextConfigContent
    );
    expect(readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf-8')).toBe(layoutContent);
  });

  it('skips reconfiguration in skip mode when already configured without force', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'configured-skip-app',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
            'next-pwa-auto': '^0.1.1',
          },
        },
        null,
        2
      )
    );
    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');
    writeFileSync(
      path.join(projectRoot, 'next.config.mjs'),
      [
        "import withPWAAuto from 'next-pwa-auto';",
        '',
        'const nextConfig = {};',
        '',
        'export default withPWAAuto()(nextConfig);',
        '',
      ].join('\n')
    );
    mkdirSync(path.join(projectRoot, 'public', '_pwa', 'icons'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'icons', 'icon-192x192.png'), 'old');
    writeFileSync(path.join(projectRoot, 'public', 'manifest.webmanifest'), '{}');
    writeFileSync(path.join(projectRoot, 'public', 'sw.js'), 'const c = 1');
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'offline.html'), 'offline');
    writeFileSync(path.join(projectRoot, 'public', 'sw-register.js'), 'const register = () => {}');

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout() { return <html><head><PWAHead /></head><body></body></html> }'
    );

    await runInit(true);

    expect(readCommandLog()).toEqual([]);
  });

  it('removes import type NextConfig from config when already configured', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'configured-typed-app',
          version: '1.0.0',
          dependencies: {
            next: '14.0.0',
            'next-pwa-auto': '^0.1.1',
          },
        },
        null,
        2
      )
    );
    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');
    writeFileSync(
      path.join(projectRoot, 'next.config.ts'),
      [
        "import type { NextConfig } from 'next';",
        "import withPWAAuto from 'next-pwa-auto';",
        '',
        'const nextConfig: NextConfig = {',
        '  reactStrictMode: true,',
        '};',
        '',
        'export default withPWAAuto()(nextConfig);',
        '',
      ].join('\n')
    );

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head><PWAHead /></head><body>{children}</body></html> }'
    );

    await runInit({ skip: true, force: true });

    const config = readFileSync(path.join(projectRoot, 'next.config.ts'), 'utf-8');
    expect(config).not.toContain("import type { NextConfig } from 'next';");
    expect(config).not.toContain(': NextConfig');
    expect(config).toContain('export default withPWAAuto()(nextConfig);');
  });
});


