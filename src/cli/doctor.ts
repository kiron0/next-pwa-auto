import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { detectRouterType, getPublicDir, isNextProject, readPackageJson } from '../config';
import { findSourceIcon } from '../icons/utils';

interface DoctorCheck {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}
const APP_LAYOUT_FILES = ['layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js'];
const APP_ROOT_LAYOUT_PATH_HINT = 'app/layout.(ts|tsx|js|jsx) (or src/app/layout.(ts|tsx|js|jsx))';
const PAGES_APP_FILES = ['_app.tsx', '_app.jsx', '_app.ts', '_app.js'];

export async function runDoctor(): Promise<void> {
  const projectRoot = process.cwd();
  const checks: DoctorCheck[] = [];
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

  const nextConfigFiles = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.mts',
  ];

  const foundConfig = nextConfigFiles.find((f) => fs.existsSync(path.join(projectRoot, f)));
  if (foundConfig) {
    const configContent = fs.readFileSync(path.join(projectRoot, foundConfig), 'utf-8');
    const usesPlugin =
      configContent.includes('next-pwa-auto') ||
      configContent.includes('withPWAAuto') ||
      configContent.includes('pwa-auto');

    checks.push({
      label: 'Next.js config',
      status: usesPlugin ? 'pass' : 'warn',
      message: usesPlugin
        ? `${foundConfig} uses next-pwa-auto`
        : `${foundConfig} found but doesn't reference next-pwa-auto`,
    });
  } else {
    checks.push({
      label: 'Next.js config',
      status: 'fail',
      message: 'No next.config.{js,mjs,ts} found',
    });
  }

  const routerType = detectRouterType(projectRoot);

  checks.push({
    label: 'Router type',
    status: 'pass',
    message:
      routerType === 'both'
        ? 'App Router + Pages Router detected'
        : routerType === 'app'
          ? 'App Router detected'
          : 'Pages Router detected',
  });

  const appLayoutPath = findTopLevelAppLayoutPath(projectRoot);
  const pagesAppPath = findPagesAppPath(projectRoot);

  if (appLayoutPath) {
    const hasPWAHead = hasPWAHeadInFile(appLayoutPath);
    checks.push({
      label: 'PWAHead (app layout)',
      status: hasPWAHead ? 'pass' : 'warn',
      message: hasPWAHead
        ? `Found <PWAHead /> in ${path.relative(projectRoot, appLayoutPath)}`
        : `Missing <PWAHead /> in ${path.relative(projectRoot, appLayoutPath)}${'\n  ' + 'Manual: Add <PWAHead /> inside <head> in ' + APP_ROOT_LAYOUT_PATH_HINT}`,
    });
  }

  if (pagesAppPath) {
    const hasPWAHead = hasPWAHeadInFile(pagesAppPath);
    checks.push({
      label: 'PWAHead (pages layout)',
      status: hasPWAHead ? 'pass' : 'warn',
      message: hasPWAHead
        ? `Found <PWAHead /> in ${path.relative(projectRoot, pagesAppPath)}`
        : `Missing <PWAHead /> in ${path.relative(projectRoot, pagesAppPath)}\n  Manual: Add <PWAHead /> in pages/_app.tsx`,
    });
  }

  const publicDir = getPublicDir(projectRoot);
  const sourceIcon = findSourceIcon(publicDir);
  const pwaIconsDir = path.join(publicDir, '_pwa', 'icons');
  const hasGeneratedIcons = fs.existsSync(pwaIconsDir)
    ? fs.readdirSync(pwaIconsDir).some((file) => file.endsWith('.png'))
    : false;

  if (sourceIcon) {
    const iconName = path.basename(sourceIcon);
    const stats = fs.statSync(sourceIcon);
    const sizeKB = Math.round(stats.size / 1024);

    checks.push({
      label: 'Source icon',
      status: sizeKB >= 1 ? 'pass' : 'warn',
      message: `Found: ${iconName} (${sizeKB}KB)${sizeKB < 50 ? ' - consider using a higher resolution source' : ''}`,
    });
  } else {
    checks.push({
      label: 'Source icon',
      status: hasGeneratedIcons ? 'pass' : 'fail',
      message: hasGeneratedIcons
        ? 'Generated PWA icons are already present in public/_pwa/icons.'
        : 'No source icon found - add icon.png or icon.svg in public/ (or run build to generate placeholder icons)',
    });
  }

  const manifestFiles = ['manifest.json', 'manifest.webmanifest'];
  const existingManifest = manifestFiles.find((f) => fs.existsSync(path.join(publicDir, f)));

  if (existingManifest) {
    checks.push({
      label: 'Manifest',
      status: 'pass',
      message: `User-defined ${existingManifest} found - will be merged with auto-generated`,
    });
  } else {
    checks.push({
      label: 'Manifest',
      status: 'pass',
      message: 'Will be auto-generated from package.json',
    });
  }

  const pwaDir = path.join(publicDir, '_pwa');

  if (fs.existsSync(pwaDir)) {
    const iconsDir = path.join(pwaDir, 'icons');

    if (fs.existsSync(iconsDir)) {
      const iconFiles = fs.readdirSync(iconsDir).filter((f) => f.endsWith('.png'));

      checks.push({
        label: 'Generated icons',
        status: iconFiles.length > 0 ? 'pass' : 'warn',
        message:
          iconFiles.length > 0
            ? `${iconFiles.length} icons in _pwa/icons/`
            : 'Icons directory exists but is empty - run a build',
      });
    }

    const offlinePage = path.join(pwaDir, 'offline.html');

    checks.push({
      label: 'Offline page',
      status: fs.existsSync(offlinePage) ? 'pass' : 'warn',
      message: fs.existsSync(offlinePage)
        ? 'Offline fallback page ready'
        : 'Not generated yet - run a build',
    });
  } else {
    checks.push({
      label: 'Generated assets',
      status: 'warn',
      message: 'No _pwa/ directory - run `next build` to generate assets',
    });
  }
  checks.push({
    label: 'HTTPS',
    status: 'warn',
    message: 'Ensure HTTPS is configured for production (required for SW)',
  });

  for (const check of checks) {
    const icon =
      check.status === 'pass'
        ? chalk.green('✅')
        : check.status === 'warn'
          ? chalk.yellow('⚠️ ')
          : chalk.red('❌');

    const label = chalk.bold(check.label);

    const message =
      check.status === 'fail'
        ? chalk.red(check.message)
        : check.status === 'warn'
          ? chalk.yellow(check.message)
          : chalk.gray(check.message);
    console.log(`  ${icon} ${label}: ${message}`);
  }

  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const passCount = checks.filter((c) => c.status === 'pass').length;

  console.log('');
  console.log(chalk.gray('-'.repeat(45)));

  if (failCount === 0) {
    console.log(
      chalk.green.bold('  🎉 PWA setup looks good!'),
      chalk.gray(`(${passCount} passed, ${warnCount} warnings)`)
    );
  } else {
    console.log(
      chalk.red.bold(`  ⚠ ${failCount} issue(s) found.`),
      chalk.gray(`(${passCount} passed, ${warnCount} warnings)`)
    );
  }
  console.log('');
}

function hasPWAHeadInFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  return /<PWAHead\s*\/?>/.test(content) || /PWAHead/.test(content);
}

function findTopLevelAppLayoutPath(projectRoot: string): string | null {
  const appRoots = [path.join(projectRoot, 'app'), path.join(projectRoot, 'src', 'app')];
  for (const appRoot of appRoots) {
    for (const file of APP_LAYOUT_FILES) {
      const candidate = path.join(appRoot, file);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function findPagesAppPath(projectRoot: string): string | null {
  const pageRoots = [path.join(projectRoot, 'pages'), path.join(projectRoot, 'src', 'pages')];
  for (const pagesRoot of pageRoots) {
    for (const file of PAGES_APP_FILES) {
      const candidate = path.join(pagesRoot, file);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
