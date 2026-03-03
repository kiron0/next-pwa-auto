import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { detectRouterType, getPublicDir, isNextProject, readPackageJson } from '../config';
import { collectPWASetupChecks, type SetupCheck } from './setup-checks';

export async function runDoctor(): Promise<void> {
  const projectRoot = process.cwd();
  const checks: SetupCheck[] = [];
  const notes: string[] = [];
  console.log('');
  console.log(chalk.bold.blue('[Doctor] next-pwa-auto'));
  console.log(chalk.gray('-'.repeat(45)));
  console.log('');
  const pkgPath = path.join(projectRoot, 'package.json');

  if (!isNextProject(projectRoot)) {
    checks.push({
      label: 'Next.js project',
      status: 'fail',
      message: 'No Next.js project detected - this tool is only valid for Next.js apps',
    });
  }

  if (fs.existsSync(pkgPath)) {
    const pkg = readPackageJson(projectRoot);
    checks.push({
      label: 'package.json',
      status: 'pass',
      message: `Found - name: "${pkg.name}"`,
    });

    try {
      const rawPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = {
        ...rawPkg.dependencies,
        ...rawPkg.devDependencies,
      };

      if (allDeps['next-pwa-auto']) {
        checks.push({
          label: 'next-pwa-auto installed',
          status: 'pass',
          message: `Version: ${allDeps['next-pwa-auto']}`,
        });
      } else {
        checks.push({
          label: 'next-pwa-auto installed',
          status: 'warn',
          message: 'Not found in dependencies - is it linked?',
        });
      }
    } catch {}
  } else {
    checks.push({
      label: 'package.json',
      status: 'fail',
      message: 'Not found in current directory',
    });
  }

  const routerType = detectRouterType(projectRoot);
  const publicDir = getPublicDir(projectRoot);
  const doctorChecks = collectPWASetupChecks(projectRoot, routerType, {
    head: {
      app: { includeManualInstructions: true },
      pages: { includeManualInstructions: true },
    },
    icon: {
      label: 'Source icon',
      sourceIconMessage: (sourceIcon) => {
        const iconName = path.basename(sourceIcon);
        const stats = fs.statSync(sourceIcon);
        const sizeKB = Math.round(stats.size / 1024);
        return `Found: ${iconName} (${sizeKB}KB)${sizeKB < 50 ? ' - consider using a higher resolution source' : ''}`;
      },
      sourceIconStatus: (sourceIcon) => {
        try {
          const stats = fs.statSync(sourceIcon);
          const sizeKB = Math.round(stats.size / 1024);
          return sizeKB >= 1 ? 'pass' : 'warn';
        } catch {
          return 'pass';
        }
      },
      generatedIconsMessage: 'Generated PWA icons are already present in public/_pwa/icons.',
      missingIconMessage: 'No source icon found and generated icons were not found.',
      missingIconStatus: 'warn',
    },
    manifest: {
      hasManifestMessage: (manifestPath) => {
        const manifestName = path.basename(manifestPath);
        return `User-defined ${manifestName} found - will be merged with auto-generated`;
      },
      missingManifestMessage:
        'No manifest found after build. Re-run next build with next-pwa-auto configured.',
    },
  });
  checks.push(...doctorChecks);

  checks.push({
    label: 'Router type',
    status: 'pass',
    message: routerType === 'app' ? 'App Router detected' : 'Pages Router detected',
  });

  notes.push('HTTPS: Ensure HTTPS is configured for production (required for SW)');

  for (const check of checks) {
    const icon =
      check.status === 'pass'
        ? String.fromCodePoint(0x2705)
        : check.status === 'warn'
          ? `${String.fromCodePoint(0x26a0, 0xfe0f)} `
          : String.fromCodePoint(0x274c);

    const label = chalk.bold(check.label);

    const message =
      check.status === 'fail'
        ? chalk.red(check.message)
        : check.status === 'warn'
          ? chalk.yellow(check.message)
          : chalk.gray(check.message);
    console.log(`  ${icon} ${label}: ${message}`);
  }

  console.log('');

  for (const note of notes) {
    console.log(`  ${String.fromCodePoint(0x26a0, 0xfe0f)}  ${chalk.yellow(note)}`);
  }

  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const passCount = checks.filter((c) => c.status === 'pass').length;

  console.log('');
  console.log(chalk.gray('-'.repeat(45)));

  if (failCount === 0) {
    console.log(
      chalk.green.bold('  ' + String.fromCodePoint(0x2705) + ' PWA setup looks good!'),
      chalk.gray(`(${passCount} passed, ${warnCount} warnings)`)
    );
  } else {
    console.log(
      chalk.red.bold(`  ${String.fromCodePoint(0x274c)} ${failCount} issue(s) found.`),
      chalk.gray(`(${passCount} passed, ${warnCount} warnings)`)
    );
  }
  console.log('');
}
