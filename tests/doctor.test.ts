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
    expect(out).toContain('⚠️ PWA setup is ready with warnings.');
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
      'No source icon found - add icon.png or icon.svg in public/ (or run build to generate placeholder icons)'
    );
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
