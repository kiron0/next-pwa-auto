import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import * as prompts from '@clack/prompts';

vi.mock('@clack/prompts', () => {
  return {
    confirm: vi.fn(),
    select: vi.fn(),
    isCancel: vi.fn(),
  };
});

describe('interactive init', () => {
  let projectRoot = '';
  let originalPath = '';
  let logs: string[] = [];
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let runInit: () => Promise<void>;
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;
  let commandLog = '';
  let commandDir = '';

  const createProject = (): string => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'next-pwa-auto-init-interactive-'));
    mkdirSync(path.join(dir, 'public'), { recursive: true });
    return dir;
  };

  const createTempCommand = (root: string): void => {
    commandDir = path.join(root, '.mock-bin');
    mkdirSync(commandDir, { recursive: true });
    commandLog = path.join(root, 'commands.log');
    const commandPath = path.join(commandDir, 'npx.cmd');
    writeFileSync(
      commandPath,
      ['@echo off', `echo npx %*>>"${commandLog.replace(/"/g, '""')}"`, 'exit /b 0'].join('\r\n'),
      'utf-8'
    );
  };

  const readCommandLog = (): string[] => {
    if (!fs.existsSync(commandLog)) {
      return [];
    }
    return readFileSync(commandLog, 'utf-8').trim().split(/\r?\n/).filter(Boolean);
  };

  beforeEach(async () => {
    projectRoot = createProject();
    createTempCommand(projectRoot);
    originalPath = process.env.PATH ?? '';
    process.env.PATH = `${commandDir}${path.delimiter}${originalPath}`;

    const cli = await import('../src/cli/init');
    runInit = cli.runInit;

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    logs = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
  });

  afterEach(() => {
    if (cwdSpy) {
      cwdSpy.mockRestore();
    }
    consoleLogSpy.mockRestore();
    process.env.PATH = originalPath;
    rmSync(projectRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('warns before icon selection when existing generated icons are present', async () => {
    const confirmSequence = [true, true, false, false];
    let confirmIndex = 0;
    vi.mocked(prompts.confirm).mockImplementation(() => {
      const value = confirmSequence[confirmIndex] ?? false;
      confirmIndex += 1;
      return value as unknown as Promise<boolean>;
    });
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.select).mockResolvedValue('icon.png');

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'interactive',
        version: '1.0.0',
        dependencies: {
          next: '14.0.0',
          'next-pwa-auto': '^0.1.1',
        },
      })
    );
    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');

    const publicDir = path.join(projectRoot, 'public');
    mkdirSync(path.join(publicDir, '_pwa', 'icons'), { recursive: true });
    writeFileSync(path.join(publicDir, 'icon.png'), 'icon');
    writeFileSync(path.join(publicDir, '_pwa', 'icons', 'icon-192x192.png'), 'old');

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html> }'
    );

    await runInit();

    const output = logs.join('\n');
    expect(output).toContain('Detected existing generated icons at public/_pwa/icons.');
    expect(output).toContain(
      'If you select an icon again, previously generated _pwa/icons files will be replaced.'
    );
    expect(readCommandLog()).toEqual([]);
    const config = readFileSync(path.join(projectRoot, 'next.config.mjs'), 'utf-8');
    expect(config).toContain('withPWAAuto()');
    expect(config).not.toContain('withPWAAuto({"icon":"public/icon.png"})');
  });

  it('allows skipping icon selection to keep existing generated icons', async () => {
    const confirmSequence = [true, true, false, false];
    let confirmIndex = 0;
    vi.mocked(prompts.confirm).mockImplementation(() => {
      const value = confirmSequence[confirmIndex] ?? false;
      confirmIndex += 1;
      return value as unknown as Promise<boolean>;
    });
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.select).mockResolvedValue('__keep_generated_icons__');

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'interactive-skip-existing-icons',
        version: '1.0.0',
        dependencies: {
          next: '14.0.0',
          'next-pwa-auto': '^0.1.1',
        },
      })
    );
    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');

    const publicDir = path.join(projectRoot, 'public');
    mkdirSync(path.join(publicDir, '_pwa', 'icons'), { recursive: true });
    writeFileSync(path.join(publicDir, 'icon.png'), 'icon');
    writeFileSync(path.join(publicDir, '_pwa', 'icons', 'icon-192x192.png'), 'old');

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html> }'
    );

    await runInit();

    const output = logs.join('\n');
    expect(output).toContain('Detected existing generated icons at public/_pwa/icons.');
    expect(output).toContain('Using existing generated icons at public/_pwa/icons.');
    const config = readFileSync(path.join(projectRoot, 'next.config.mjs'), 'utf-8');
    expect(config).toContain('withPWAAuto()');
    expect(config).not.toContain('public/icon.png');
  });

  it('does not require a public icon file when _pwa/icons already exist', async () => {
    const confirmSequence = [true, false, false];
    let confirmIndex = 0;
    vi.mocked(prompts.confirm).mockImplementation(() => {
      const value = confirmSequence[confirmIndex] ?? false;
      confirmIndex += 1;
      return value as unknown as Promise<boolean>;
    });
    vi.mocked(prompts.isCancel).mockReturnValue(false);

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'interactive-no-icon',
        version: '1.0.0',
        dependencies: {
          next: '14.0.0',
          'next-pwa-auto': '^0.1.1',
        },
      })
    );
    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');

    const publicDir = path.join(projectRoot, 'public');
    mkdirSync(path.join(publicDir, '_pwa', 'icons'), { recursive: true });
    writeFileSync(path.join(publicDir, '_pwa', 'icons', 'icon-192x192.png'), 'old');

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html> }'
    );

    await runInit();

    const output = logs.join('\n');
    expect(output).toContain(
      'This is okay: existing generated icons will be reused when no new source icon is selected.'
    );
    expect(readCommandLog()).toEqual([]);
    const config = readFileSync(path.join(projectRoot, 'next.config.mjs'), 'utf-8');
    expect(config).toContain('withPWAAuto()');
  });

  it('does not offer keep-existing option when generated icons are absent', async () => {
    const confirmSequence = [true, true, false, false];
    let confirmIndex = 0;
    vi.mocked(prompts.confirm).mockImplementation(() => {
      const value = confirmSequence[confirmIndex] ?? false;
      confirmIndex += 1;
      return value as unknown as Promise<boolean>;
    });
    vi.mocked(prompts.isCancel).mockReturnValue(false);

    const selectCalls: Array<Array<{ value: string }>> = [];
    vi.mocked(prompts.select).mockImplementation(({ options }: { options: Array<{ value: string }> }) => {
      selectCalls.push(options);
      return Promise.resolve('icon.png');
    });

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'interactive-no-generated-icons',
        version: '1.0.0',
        dependencies: {
          next: '14.0.0',
          'next-pwa-auto': '^0.1.1',
        },
      })
    );
    writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}');

    writeFileSync(path.join(projectRoot, 'public', 'icon.png'), 'icon');

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html> }'
    );

    await runInit();

    expect(selectCalls).toHaveLength(1);
    const selectOptions = selectCalls[0];
    expect(selectOptions?.map((option) => option.value)).not.toContain('__keep_generated_icons__');
    expect(selectOptions?.map((option) => option.value)).toContain('__placeholder__');
  });

  it('auto-adds <PWAHead /> when missing', async () => {
    const confirmSequence = [true, false, false];
    let confirmIndex = 0;
    vi.mocked(prompts.confirm).mockImplementation(() => {
      const value = confirmSequence[confirmIndex] ?? false;
      confirmIndex += 1;
      return value as unknown as Promise<boolean>;
    });
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.select).mockResolvedValue('__placeholder__');

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'interactive-no-pwahead',
          version: '0.0.1',
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

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head></head><body>{children}</body></html> }'
    );

    await runInit();

    const output = logs.join('\n');
    expect(output).toContain('Added <PWAHead /> to layout');
    const layout = readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf-8');
    expect(layout).toContain('<PWAHead />');
  });

  it('does not re-ask to insert PWAHead when already present', async () => {
    const confirmSequence = [true, true, false, false];
    let confirmIndex = 0;
    vi.mocked(prompts.confirm).mockImplementation(() => {
      const value = confirmSequence[confirmIndex] ?? false;
      confirmIndex += 1;
      return value as unknown as Promise<boolean>;
    });
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.select).mockResolvedValue('__placeholder__');

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'interactive-existing-pwahead',
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
        "import { withPWAAuto } from 'next-pwa-auto';",
        '',
        'const nextConfig = {};',
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

    await runInit();

    const output = logs.join('\n');
    expect(output).toContain('Detected existing <PWAHead /> in app\\layout.tsx.');
    expect(
      vi.mocked(prompts.confirm).mock.calls.find((call) => call[0].message === 'Add <PWAHead /> to your root layout?')
    ).toBeUndefined();
    expect(output).toContain('next-pwa-auto already configured in next.config');
  });

  it('keeps existing config options and does not overwrite plugin options from selection', async () => {
    const confirmSequence = [true, false, false];
    let confirmIndex = 0;
    vi.mocked(prompts.confirm).mockImplementation(() => {
      const value = confirmSequence[confirmIndex] ?? false;
      confirmIndex += 1;
      return value as unknown as Promise<boolean>;
    });
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.select).mockResolvedValue('icon-new.png');

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'interactive-config-update',
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
        "import { withPWAAuto } from 'next-pwa-auto';",
        '',
        'const nextConfig = {};',
        '',
        'export default withPWAAuto({"icon":"public/icon-old.png"})(nextConfig);',
        '',
      ].join('\n')
    );

    const publicDir = path.join(projectRoot, 'public');
    writeFileSync(path.join(publicDir, 'icon-old.png'), 'old');
    writeFileSync(path.join(publicDir, 'icon-new.png'), 'new');

    await runInit();

    const output = readCommandLog();
    expect(output).toEqual([]);
    const config = readFileSync(path.join(projectRoot, 'next.config.mjs'), 'utf-8');
    expect(config).toContain('withPWAAuto({"icon":"public/icon-old.png"})(nextConfig)');
    expect(config).not.toContain('withPWAAuto({"icon":"public/icon-new.png"})(nextConfig)');
  });

  it('asks before re-running when project is already configured and allows user to cancel', async () => {
    const confirmSequence = [true, false];
    let confirmIndex = 0;
    vi.mocked(prompts.confirm).mockImplementation(() => {
      const value = confirmSequence[confirmIndex] ?? false;
      confirmIndex += 1;
      return value as unknown as Promise<boolean>;
    });
    vi.mocked(prompts.isCancel).mockReturnValue(false);

    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'interactive-already-configured-cancel',
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
        "import { withPWAAuto } from 'next-pwa-auto';",
        '',
        'const nextConfig = {};',
        '',
        'export default withPWAAuto()(nextConfig);',
        '',
      ].join('\n')
    );
    mkdirSync(path.join(projectRoot, 'public', '_pwa', 'icons'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'icons', 'icon-192x192.png'), 'icon');
    writeFileSync(path.join(projectRoot, 'public', 'manifest.webmanifest'), '{}');
    writeFileSync(path.join(projectRoot, 'public', 'sw.js'), 'const c = 1');
    writeFileSync(path.join(projectRoot, 'public', '_pwa', 'offline.html'), 'offline');
    writeFileSync(path.join(projectRoot, 'public', 'sw-register.js'), 'const register = () => {}');

    mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><head><PWAHead /></head><body>{children}</body></html> }'
    );

    await runInit();

    const output = logs.join('\n');
    expect(vi.mocked(prompts.confirm)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prompts.confirm)).toHaveBeenNthCalledWith(2, {
      message: 'next-pwa-auto is already configured. Setup again?',
      initialValue: false,
    });
    expect(output).toContain('  Thanks for using next-pwa-auto');
    expect(readCommandLog()).toEqual([]);
  });
});

