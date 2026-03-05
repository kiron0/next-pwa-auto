import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { detectRouterType, isNextProject, readPackageJson } from '../config';
import { collectPWASetupChecks, type AutoFix, type SetupCheck } from './setup-checks';
import { injectPWAHead, updateNextConfig } from './init';

interface DoctorOptions {
  fix?: boolean;
}

type Severity = 'info' | 'warning' | 'error';
type AutoFixResult = 'applied' | 'already' | 'failed' | 'skipped';

interface FixActionResult {
  action: AutoFix;
  result: AutoFixResult;
  detail: string;
}

interface FixRunResult {
  appliedCount: number;
  actions: FixActionResult[];
}

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const projectRoot = process.cwd();
  const isFixMode = options.fix === true;
  const notes: string[] = ['HTTPS: Ensure HTTPS is configured for production (required for SW)'];

  const buildChecks = (): SetupCheck[] =>
    collectPWASetupChecks(projectRoot, detectRouterType(projectRoot), {
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

  const collectDoctorChecks = (): SetupCheck[] => {
    const checkList: SetupCheck[] = [];
    const pkgPath = path.join(projectRoot, 'package.json');

    if (!isNextProject(projectRoot)) {
      checkList.push({
        label: 'Next.js project',
        status: 'fail',
        impact: 'blocking',
        message: 'No Next.js project detected - this tool is only valid for Next.js apps',
        fixCommands: ['npm install next'],
      });
    }

    if (fs.existsSync(pkgPath)) {
      const pkg = readPackageJson(projectRoot);
      checkList.push({
        label: 'package.json',
        status: 'pass',
        impact: 'optional',
        message: `Found - name: "${pkg.name}"`,
      });

      try {
        const rawPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = {
          ...rawPkg.dependencies,
          ...rawPkg.devDependencies,
        };

        if (allDeps['next-pwa-auto']) {
          checkList.push({
            label: 'next-pwa-auto installed',
            status: 'pass',
            impact: 'optional',
            message: `Version: ${allDeps['next-pwa-auto']}`,
          });
        } else {
          checkList.push({
            label: 'next-pwa-auto installed',
            status: 'warn',
            impact: 'warning',
            message: 'Not found in dependencies - is it linked?',
            fixCommands: ['npm install next-pwa-auto'],
          });
        }
      } catch {}
    } else {
      checkList.push({
        label: 'package.json',
        status: 'fail',
        impact: 'blocking',
        message: 'Not found in current directory',
      });
    }

    checkList.push(...buildChecks());
    const routerType = detectRouterType(projectRoot);
    checkList.push({
      label: 'Router type',
      status: 'pass',
      impact: 'optional',
      message: routerType === 'app' ? 'App Router detected' : 'Pages Router detected',
    });
    return checkList;
  };

  let checks: SetupCheck[] = collectDoctorChecks();

  console.log('');
  console.log(chalk.bold.blue('[Doctor] next-pwa-auto'));
  console.log(chalk.gray('-'.repeat(45)));
  console.log('');

  if (isFixMode) {
    const routerType = detectRouterType(projectRoot);
    const beforeSummary = summarizeChecks(checks);
    const fixResult = applyDoctorFixes(checks, projectRoot, routerType);

    if (fixResult.actions.length > 0) {
      console.log('');
      console.log(chalk.bold('  Auto-fix results'));
      for (const action of fixResult.actions) {
        const message = `${getFixActionLabel(action.action)}: ${action.result} (${action.detail})`;
        const styled =
          action.result === 'applied' || action.result === 'already'
            ? chalk.green(message)
            : action.result === 'failed'
              ? chalk.red(message)
              : chalk.yellow(message);
        console.log(`  ${styled}`);
        console.log(
          `  AUTO_FIX|action=${action.action}|result=${action.result}|detail=${encodeStableValue(action.detail)}`
        );
      }
    }

    checks = collectDoctorChecks();
    const afterSummary = summarizeChecks(checks);
    console.log('');
    console.log(
      chalk.gray(
        `Auto-fix summary: before ${beforeSummary.pass} pass/${beforeSummary.warn} warn/${beforeSummary.fail} fail -> after ${afterSummary.pass} pass/${afterSummary.warn} warn/${afterSummary.fail} fail`
      )
    );
    console.log(
      `AUTO_FIX_SUMMARY|before_pass=${beforeSummary.pass}|before_warn=${beforeSummary.warn}|before_fail=${beforeSummary.fail}|after_pass=${afterSummary.pass}|after_warn=${afterSummary.warn}|after_fail=${afterSummary.fail}|applied=${fixResult.appliedCount}`
    );
  }

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

    const severity = statusToSeverity(check.status);
    console.log(`     Severity: ${chalk.gray(severity)}`);

    if (check.impact) {
      console.log(`     Impact: ${chalk.gray(check.impact)}`);
    }

    if (check.status !== 'pass' && check.fixCommands?.length) {
      for (const command of check.fixCommands) {
        console.log(`     Fix: ${chalk.blue(command)}`);
      }
    }

    console.log(
      `  CHECK|label=${encodeStableValue(check.label)}|status=${check.status}|severity=${severity}|impact=${check.impact ?? 'optional'}|message=${encodeStableValue(check.message)}`
    );
    if (check.status !== 'pass' && check.fixCommands?.length) {
      for (const command of check.fixCommands) {
        console.log(`  FIX|label=${encodeStableValue(check.label)}|command=${encodeStableValue(command)}`);
      }
    }
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

function applyDoctorFixes(
  checks: SetupCheck[],
  projectRoot: string,
  routerType: 'app' | 'pages'
): FixRunResult {
  const pendingFixes = new Set<AutoFix>();
  const actions: FixActionResult[] = [];

  for (const check of checks) {
    if (check.status === 'pass' || !check.autoFix) {
      continue;
    }
    if (check.autoFix === 'stale-assets') {
      pendingFixes.add('stale-assets');
    } else if (check.autoFix === 'next-config') {
      pendingFixes.add('next-config');
    } else if (check.autoFix === 'pwa-head-app') {
      pendingFixes.add('pwa-head-app');
    } else if (check.autoFix === 'pwa-head-pages') {
      pendingFixes.add('pwa-head-pages');
    }
  }

  let fixed = 0;
  if (pendingFixes.has('next-config')) {
    const result = updateNextConfig(projectRoot);
    if (result === 'updated') {
      fixed += 1;
      console.log(chalk.green(`  ${String.fromCodePoint(0x2705)} Updated next.config`));
      actions.push({ action: 'next-config', result: 'applied', detail: 'next.config updated' });
    } else if (result === 'already') {
      console.log(chalk.green(`  ${String.fromCodePoint(0x2705)} next.config already configured.`));
      actions.push({ action: 'next-config', result: 'already', detail: 'next.config already configured' });
    } else {
      console.log(chalk.red(`  ${String.fromCodePoint(0x274c)} Unable to auto-update next.config`));
      actions.push({ action: 'next-config', result: 'failed', detail: 'unable to update next.config' });
    }
  }

  const shouldFixHead =
    (pendingFixes.has('pwa-head-app') && routerType === 'app') ||
    (pendingFixes.has('pwa-head-pages') && routerType === 'pages');
  if (shouldFixHead) {
    const result = injectPWAHead(projectRoot, routerType);
    const action: AutoFix = routerType === 'app' ? 'pwa-head-app' : 'pwa-head-pages';
    if (result === 'injected') {
      fixed += 1;
      console.log(chalk.green(`  ${String.fromCodePoint(0x2705)} Added <PWAHead /> to layout.`));
      actions.push({ action, result: 'applied', detail: 'PWAHead inserted' });
    } else if (result === 'already') {
      console.log(chalk.green(`  ${String.fromCodePoint(0x2705)} <PWAHead /> already present.`));
      actions.push({ action, result: 'already', detail: 'PWAHead already present' });
    } else {
      console.log(chalk.yellow(`  ${String.fromCodePoint(0x26a0, 0xfe0f)} Could not auto-insert <PWAHead />.`));
      actions.push({ action, result: 'failed', detail: 'could not auto-insert PWAHead' });
    }
  } else if (pendingFixes.has('pwa-head-app') || pendingFixes.has('pwa-head-pages')) {
    const action: AutoFix = pendingFixes.has('pwa-head-app') ? 'pwa-head-app' : 'pwa-head-pages';
    actions.push({
      action,
      result: 'skipped',
      detail: `router mismatch for requested fix (${routerType} router detected)`,
    });
  }

  if (pendingFixes.has('stale-assets')) {
    if (cleanupStaleAssets(projectRoot)) {
      fixed += 1;
      console.log(
        chalk.green(`  ${String.fromCodePoint(0x2705)} Cleared stale generated assets from public/_pwa.`)
      );
      actions.push({
        action: 'stale-assets',
        result: 'applied',
        detail: 'removed stale artifacts from public/_pwa',
      });
    } else {
      actions.push({
        action: 'stale-assets',
        result: 'already',
        detail: 'no stale artifacts detected in public/_pwa',
      });
    }
  }

  if (fixed === 0 && isAutoFixNeeded(checks)) {
    console.log(
      chalk.yellow(
        `  ${String.fromCodePoint(0x26a0, 0xfe0f)} Auto-fix is limited. Re-run with manual steps shown above.`
      )
    );
  }

  return { appliedCount: fixed, actions };
}

function isAutoFixNeeded(checks: SetupCheck[]): boolean {
  return checks.some((check) => check.status !== 'pass' && check.autoFix);
}

function cleanupStaleAssets(projectRoot: string): boolean {
  const pwaDir = path.join(projectRoot, 'public', '_pwa');
  const staleTargets = [
    path.join(pwaDir, 'icons'),
    path.join(pwaDir, 'offline.html'),
    path.join(pwaDir, 'sw-register.js'),
    path.join(pwaDir, '.icon-manifest.json'),
  ];

  let removed = false;
  for (const target of staleTargets) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removed = true;
    }
  }

  return removed;
}

function statusToSeverity(status: SetupCheck['status']): Severity {
  if (status === 'fail') {
    return 'error';
  }
  if (status === 'warn') {
    return 'warning';
  }
  return 'info';
}

function summarizeChecks(checks: SetupCheck[]): { pass: number; warn: number; fail: number } {
  return {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };
}

function encodeStableValue(value: string): string {
  return value.replace(/\r?\n/g, '\\n').replace(/\|/g, '\\|');
}

function getFixActionLabel(action: AutoFix): string {
  switch (action) {
    case 'next-config':
      return 'next.config';
    case 'pwa-head-app':
      return 'PWAHead (app)';
    case 'pwa-head-pages':
      return 'PWAHead (pages)';
    case 'stale-assets':
      return 'stale assets';
    default:
      return action;
  }
}
