import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPublicDir } from '../config';
import { findSourceIcon } from '../icons/utils';
import {
  APP_LAYOUT_PATH_HINT,
  findNextConfigFile,
  findTopLevelAppLayout,
  findTopLevelPagesLayout,
  hasGeneratedPwaIcons,
  hasPWAHeadInFile,
  type RouterType,
} from './setup-discovery';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface SetupCheck {
  label: string;
  status: CheckStatus;
  message: string;
}

export const PWA_MANIFEST_FILES = ['manifest.webmanifest', 'manifest.json'];
export const PWA_SERVICE_WORKER_CANDIDATES = [
  path.join('public', 'sw.js'),
  path.join('public', '_pwa', 'sw.js'),
  path.join('.next', 'static', 'sw.js'),
  path.join('.next', 'static', 'chunks', 'sw.js'),
  path.join('public', 'sw-register.js'),
  path.join('public', '_pwa', 'sw-register.js'),
];
export const SW_REGISTER_CANDIDATES = [
  path.join('public', 'sw-register.js'),
  path.join('public', '_pwa', 'sw-register.js'),
];

export function findServiceWorkerPath(projectRoot: string): string | null {
  return (
    PWA_SERVICE_WORKER_CANDIDATES.map((candidate) => path.join(projectRoot, candidate)).find((swPath) =>
      fs.existsSync(swPath)
    ) || null
  );
}

interface HeadCheckOptions {
  includeManualInstructions?: boolean;
}

interface HeadChecksOptions {
  app?: HeadCheckOptions;
  pages?: HeadCheckOptions;
}

interface IconCheckOptions {
  label?: string;
  sourceIconMessage?: (sourceIcon: string, projectRoot: string) => string;
  sourceIconStatus?: (sourceIcon: string) => CheckStatus;
  generatedIconsMessage?: string;
  missingIconMessage?: string;
  generatedIconsStatus?: CheckStatus;
  missingIconStatus?: CheckStatus;
}

interface ManifestCheckOptions {
  hasManifestMessage?: (manifestPath: string, projectRoot: string) => string;
  missingManifestMessage?: string;
  missingManifestStatus?: CheckStatus;
}

interface SimpleCheckLabelOptions {
  label?: string;
  missingMessage?: string;
}

export interface PWASetupCheckOptions {
  head?: HeadChecksOptions;
  icon?: IconCheckOptions;
  manifest?: ManifestCheckOptions;
  serviceWorker?: SimpleCheckLabelOptions;
  offline?: SimpleCheckLabelOptions;
}

const ALLOWED_MINOR_WARNING_LABELS = new Set(['HTTPS', 'Icons']);

function isAllowedMinorWarning(check: SetupCheck): boolean {
  return check.status === 'warn' && ALLOWED_MINOR_WARNING_LABELS.has(check.label);
}

export function collectPWASetupChecks(
  projectRoot: string,
  routerType: RouterType,
  options: PWASetupCheckOptions = {}
): SetupCheck[] {
  return [
    checkNextConfig(projectRoot),
    ...collectPWAHeadChecks(projectRoot, routerType, options.head),
    checkPWAIcons(projectRoot, options.icon),
    checkManifest(projectRoot, options.manifest),
    checkServiceWorker(projectRoot, options.serviceWorker),
    checkOfflinePage(projectRoot, options.offline),
  ];
}

function collectPWAHeadChecks(
  projectRoot: string,
  routerType: RouterType,
  options: HeadChecksOptions = {}
): SetupCheck[] {
  const checks: SetupCheck[] = [];
  if (routerType === 'app') {
    checks.push(checkPWAHeadInAppLayout(projectRoot, options.app));
  }
  if (routerType === 'pages') {
    checks.push(checkPWAHeadInPagesLayout(projectRoot, options.pages));
  }
  return checks;
}

function getCheck(checks: SetupCheck[], label: string): SetupCheck | undefined {
  return checks.find((check) => check.label === label);
}

function hasSwRegisterScript(projectRoot: string | undefined, checks: SetupCheck[] = []): boolean {
  if (projectRoot) {
    return SW_REGISTER_CANDIDATES.map((candidate) => path.join(projectRoot, candidate)).some(
      (swRegisterPath) => fs.existsSync(swRegisterPath)
    );
  }

  const swCheck = getCheck(checks, 'Service worker');
  return Boolean(swCheck && swCheck.message.includes('sw-register.js'));
}

export function canSkipIfConfigured(
  checks: SetupCheck[],
  routerType: RouterType,
  projectRoot?: string
): boolean {
  const nextConfigCheck = checks.find((check) => check.label === 'Next config');
  if (!nextConfigCheck || nextConfigCheck.status !== 'pass') {
    return false;
  }

  const blockingWarnings = checks.filter(
    (check) => check.status === 'warn' && !isAllowedMinorWarning(check)
  );
  if (blockingWarnings.length > 0) {
    return false;
  }

  const manifestCheck = getCheck(checks, 'Manifest');
  const iconsCheck = getCheck(checks, 'Icons');
  const offlineCheck = getCheck(checks, 'Offline page');
  if (
    !manifestCheck ||
    manifestCheck.status !== 'pass' ||
    !iconsCheck ||
    iconsCheck.status !== 'pass' ||
    !offlineCheck ||
    offlineCheck.status !== 'pass'
  ) {
    return false;
  }

  if (!hasSwRegisterScript(projectRoot, checks)) {
    return false;
  }

  const requiredHeadChecks =
    routerType === 'app'
      ? checks.filter((check) => check.label === 'PWAHead (app layout)')
      : checks.filter((check) => check.label === 'PWAHead (pages layout)');

  return requiredHeadChecks.every((check) => check.status === 'pass');
}

export function checkNextConfig(projectRoot: string): SetupCheck {
  const configFile = findNextConfigFile(projectRoot);
  if (!configFile) {
    return {
      label: 'Next config',
      status: 'fail',
      message: 'No next.config.{js,mjs,ts,mts} found.',
    };
  }

  const content = fs.readFileSync(path.join(projectRoot, configFile), 'utf-8');
  const hasPlugin = content.includes('next-pwa-auto') || content.includes('withPWAAuto');
  return {
    label: 'Next config',
    status: hasPlugin ? 'pass' : 'warn',
    message: hasPlugin
      ? `${configFile} uses next-pwa-auto`
      : `${configFile} found but doesn't use next-pwa-auto`,
  };
}

function checkPWAHeadInAppLayout(projectRoot: string, options?: HeadCheckOptions): SetupCheck {
  const layoutPath = findTopLevelAppLayout(projectRoot);
  if (!layoutPath) {
    return {
      label: 'PWAHead (app layout)',
      status: 'fail',
      message: `Could not find app layout at ${APP_LAYOUT_PATH_HINT}`,
    };
  }

  const hasPWAHead = hasPWAHeadInFile(layoutPath);
  const relativePath = path.relative(projectRoot, layoutPath);
  const message = hasPWAHead
    ? `Found <PWAHead /> in ${relativePath}`
    : `Missing <PWAHead /> in ${relativePath}${
        options?.includeManualInstructions
          ? `\n  Manual: Add <PWAHead /> inside <head> in ${relativePath}`
          : ''
      }`;

  return {
    label: 'PWAHead (app layout)',
    status: hasPWAHead ? 'pass' : 'warn',
    message,
  };
}

function checkPWAHeadInPagesLayout(projectRoot: string, options?: HeadCheckOptions): SetupCheck {
  const appPath = findTopLevelPagesLayout(projectRoot);
  if (!appPath) {
    return {
      label: 'PWAHead (pages layout)',
      status: 'fail',
      message: 'Could not find pages/_app',
    };
  }

  const hasPWAHead = hasPWAHeadInFile(appPath);
  const relativePath = path.relative(projectRoot, appPath);
  const message = hasPWAHead
    ? `Found <PWAHead /> in ${relativePath}`
    : `Missing <PWAHead /> in ${relativePath}${
        options?.includeManualInstructions ? '\n  Manual: Add <PWAHead /> in pages/_app.tsx' : ''
      }`;

  return {
    label: 'PWAHead (pages layout)',
    status: hasPWAHead ? 'pass' : 'warn',
    message,
  };
}

function checkPWAIcons(
  projectRoot: string,
  options: IconCheckOptions = {}
): SetupCheck {
  const publicDir = getPublicDir(projectRoot);
  const sourceIcon = findSourceIcon(publicDir);

  if (sourceIcon) {
    const status = options.sourceIconStatus ? options.sourceIconStatus(sourceIcon) : 'pass';
    return {
      label: options.label || 'Icons',
      status,
      message:
        options.sourceIconMessage?.(sourceIcon, projectRoot) ??
        `Found source icon: ${path.relative(projectRoot, sourceIcon)}`,
    };
  }

  const generatedIconsExists = hasGeneratedPwaIcons(projectRoot);
  const label = options.label || 'Icons';
  const missingIconMessage =
    options.missingIconMessage ??
    'No source icon found and generated icons were not found.';
  return {
    label,
    status: generatedIconsExists
      ? (options.generatedIconsStatus ?? 'pass')
      : (options.missingIconStatus ?? 'warn'),
    message: generatedIconsExists
      ? (options.generatedIconsMessage ?? 'Generated PWA icons exist in public/_pwa/icons.')
      : missingIconMessage,
  };
}

function checkManifest(
  projectRoot: string,
  options: ManifestCheckOptions = {}
): SetupCheck {
  const publicDir = getPublicDir(projectRoot);
  const manifestPath = PWA_MANIFEST_FILES.map((file) => path.join(publicDir, file)).find((p) =>
    fs.existsSync(p)
  );

  if (manifestPath) {
    return {
      label: 'Manifest',
      status: 'pass',
      message:
        options.hasManifestMessage?.(manifestPath, projectRoot) ??
        `Found ${path.relative(projectRoot, manifestPath)}.`,
    };
  }

  return {
    label: 'Manifest',
    status: options.missingManifestStatus ?? 'warn',
    message:
      options.missingManifestMessage ??
      'No manifest found after build. Re-run next build with next-pwa-auto configured.',
  };
}

function checkServiceWorker(
  projectRoot: string,
  options: SimpleCheckLabelOptions = {}
): SetupCheck {
  const swPath = findServiceWorkerPath(projectRoot);

  if (swPath) {
    return {
      label: options.label || 'Service worker',
      status: 'pass',
      message: `Found ${path.relative(projectRoot, swPath)}.`,
    };
  }

  return {
    label: options.label || 'Service worker',
    status: 'warn',
    message:
      options.missingMessage ??
      'Service worker not found after build. Verify webpack mode and withPWAAuto integration.',
  };
}

function checkOfflinePage(
  projectRoot: string,
  options: SimpleCheckLabelOptions = {}
): SetupCheck {
  const offlinePagePath = path.join(getPublicDir(projectRoot), '_pwa', 'offline.html');
  if (fs.existsSync(offlinePagePath)) {
    return {
      label: options.label || 'Offline page',
      status: 'pass',
      message: 'Offline fallback page exists.',
    };
  }

  return {
    label: options.label || 'Offline page',
    status: 'warn',
    message:
      options.missingMessage ??
      'Offline fallback page not found after build. Re-run next build with next-pwa-auto configured.',
  };
}
