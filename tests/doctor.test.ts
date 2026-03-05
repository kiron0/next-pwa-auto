import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { runDoctor } from '../src/cli/doctor';

describe('doctor command', () => {
  let projectRoot = '';
  let logs: string[] = [];
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

  const createProject = (): string => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'next-pwa-auto-doctor-'));
    mkdirSync(path.join(dir, 'public'), { recursive: true });
    return dir;
  };

  beforeEach(() => {
    projectRoot = createProject();
    mkdirSync(path.join(projectRoot, 'public'), { recursive: true });
    mkdirSync(path.join(projectRoot, 'public', '_pwa', 'icons'), { recursive: true });
    logs = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
  });

  afterEach(() => {
    if (cwdSpy) {
      cwdSpy.mockRestore();
    }
    consoleLogSpy.mockRestore();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('passes source-icon check if generated icons exist even without public icon', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-skip-source-icon',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    writeFileSync(
      path.join(projectRoot, 'public', '_pwa', 'icons', 'icon-192x192.png'),
      'old-icon'
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain('Source icon');
    expect(out).toContain('Generated PWA icons are already present in public/_pwa/icons.');
  });

  it('reports PWAHead status in app layout', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-app-layout',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      "import PWAHead from 'next-pwa-auto/head';\nexport default function RootLayout({ children }) { return <html><head><PWAHead /></head><body>{children}</body></html>; }"
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain('PWAHead (app layout):');
    expect(out).toContain(`Found <PWAHead /> in ${path.join('app', 'layout.tsx')}`);
  });

  it('warns when PWAHead is missing in app layout', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-app-layout-missing-head',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html>; }'
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain('PWAHead (app layout):');
    expect(out).toContain('Missing <PWAHead /> in app\\layout.tsx');
    expect(out).toContain('Manual: Add <PWAHead /> inside <head> in app\\layout.tsx');
  });

  it('warns when PWAHead is missing in pages _app', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-pages-layout-missing-head',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    mkdirSync(path.join(projectRoot, 'pages'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'pages', '_app.tsx'),
      'export default function App({ Component, pageProps }) { return <Component {...pageProps} />; }'
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain('PWAHead (pages layout):');
    expect(out).toContain('Missing <PWAHead /> in pages\\_app.tsx');
    expect(out).toContain('Manual: Add <PWAHead /> in pages/_app.tsx');
  });

  it('fails source-icon check if no source icon and no generated icons', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-no-icons',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain('Source icon');
    expect(out).toContain(
      'No source icon found and generated icons were not found.'
    );
  });

  it('uses final build-time warnings when artifacts already exist', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-post-build-artifacts',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    mkdirSync(path.join(projectRoot, 'public', '_pwa', 'icons'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'icons', 'icon-192x192.png'), 'icon');
    writeFileSync(path.join(projectRoot, 'public', 'manifest.webmanifest'), '{}');
    mkdirSync(path.join(projectRoot, 'public', '_pwa'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'offline.html'), 'offline');
    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head><PWAHead /></head><body>{children}</body></html> }'
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain(
      'Service worker not found after build. Verify webpack mode and withPWAAuto integration.'
    );
  });

  it('passes service worker check when worker exists in .next/static', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-webpack-sw',
          version: '1.0.0',
          dependencies: {
            next: '16.0.0',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    mkdirSync(path.join(projectRoot, '.next', 'static'), { recursive: true });
    writeFileSync(path.join(projectRoot, '.next', 'static', 'sw.js'), 'const c = 1;');
    mkdirSync(path.join(projectRoot, 'public', '_pwa', 'icons'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'icons', 'icon-192x192.png'), 'old');

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head><PWAHead /></head><body>{children}</body></html> }'
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain('Found .next\\static\\sw.js.');
    expect(out).not.toContain(
      'Service worker not found after build. Verify webpack mode and withPWAAuto integration.'
    );
  });

  it('passes service worker check when sw-register.js exists', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-sw-register-script',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    mkdirSync(path.join(projectRoot, 'public', '_pwa'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'sw-register.js'), 'console.log("sw register");');

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head><PWAHead /></head><body>{children}</body></html> }'
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toMatch(/Found public[\\\/]_pwa[\\\/]sw-register\.js\./);
    expect(out).not.toContain(
      'Service worker not found after build. Verify webpack mode and withPWAAuto integration.'
    );
  });

  it('uses post-build missing-source-icon message when no source icon exists', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-post-build-no-source-icon',
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
      "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n"
    );

    writeFileSync(path.join(projectRoot, 'public', 'manifest.webmanifest'), '{}');
    mkdirSync(path.join(projectRoot, 'public', '_pwa'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'offline.html'), 'offline');

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain('No source icon found and generated icons were not found.');
    expect(out).not.toContain('No source icon found - add icon.png or icon.svg in public/');
  });

  it('applies fixes when run with --fix', async () => {
    const nextConfigPath = path.join(projectRoot, 'next.config.mjs');
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-auto-fix',
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
      nextConfigPath,
      "const nextConfig = {};\nmodule.exports = nextConfig;"
    );
    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html>; }'
    );
    mkdirSync(path.join(projectRoot, 'public', '_pwa'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'offline.html'), 'offline');
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'sw-register.js'), 'register');

    await runDoctor({ fix: true });

    const configContent = readFileSync(nextConfigPath, 'utf-8');
    const layoutContent = readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf-8');
    const out = logs.join('\n');
    expect(configContent).toContain("from 'next-pwa-auto'");
    expect(configContent).toContain('withPWAAuto');
    expect(layoutContent).toContain('PWAHead');
    expect(out).toContain('Updated next.config');
    expect(out).toContain('Added <PWAHead /> to layout.');
    expect(out).toContain('AUTO_FIX|action=next-config|result=applied');
    expect(out).toContain('AUTO_FIX_SUMMARY|');
  });

  it('prints stable severity and fix command lines for CI parsing', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-ci-lines',
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
    writeFileSync(path.join(projectRoot, 'next.config.mjs'), 'const nextConfig = {};\nexport default nextConfig;\n');
    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html>; }'
    );

    await runDoctor();

    const out = logs.join('\n');
    expect(out).toContain('CHECK|label=Next config|status=warn|severity=warning|impact=blocking|');
    expect(out).toContain('FIX|label=Next config|command=npx next-pwa-auto init --skip --force');
  });

  it('flags missing Next.js project', async () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-non-next',
          version: '1.0.0',
        },
        null,
        2
      )
    );

    await runDoctor();
    const out = logs.join('\n');
    expect(out).toContain('Next.js project');
    expect(out).toContain('No Next.js project detected');
  });
});


