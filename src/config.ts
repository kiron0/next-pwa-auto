import * as fs from 'fs';
import * as path from 'path';
import { PackageInfo, PWAAutoConfig, ResolvedConfig } from './types';

const DEFAULTS: Omit<ResolvedConfig, 'projectRoot' | 'routerType' | 'packageInfo'> = {
  disable: false,
  offline: true,
  icon: null,
  manifest: {},
  workbox: {
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    skipWaiting: true,
    clientsClaim: true,
    exclude: [/\.map$/, /^manifest.*\.js$/],
  },
  cacheStrategies: {
    navigation: 'networkFirst',
    staticAssets: 'cacheFirst',
    images: 'staleWhileRevalidate',
    api: 'networkOnly',
  },
  pwaDir: '_pwa',
  disableInDev: true,
  swDest: 'sw.js',
  scope: '/',
};

export function resolveConfig(userConfig: PWAAutoConfig = {}): ResolvedConfig {
  const projectRoot = process.cwd();
  const packageInfo = readPackageJson(projectRoot);
  const routerType = detectRouterType(projectRoot);

  return {
    disable: userConfig.disable ?? DEFAULTS.disable,
    offline: userConfig.offline ?? DEFAULTS.offline,
    icon: userConfig.icon ?? DEFAULTS.icon,
    manifest: { ...DEFAULTS.manifest, ...userConfig.manifest },
    workbox: { ...DEFAULTS.workbox, ...userConfig.workbox },
    cacheStrategies: { ...DEFAULTS.cacheStrategies, ...userConfig.cacheStrategies },
    pwaDir: userConfig.pwaDir ?? DEFAULTS.pwaDir,
    disableInDev: userConfig.disableInDev ?? DEFAULTS.disableInDev,
    swDest: userConfig.swDest ?? DEFAULTS.swDest,
    scope: userConfig.scope ?? DEFAULTS.scope,
    projectRoot,
    routerType,
    packageInfo,
  };
}

export function readPackageJson(projectRoot: string): PackageInfo {
  const pkgPath = path.join(projectRoot, 'package.json');
  const fallback: PackageInfo = {
    name: path.basename(projectRoot),
    description: '',
    version: '0.0.0',
  };

  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);

    return {
      name: pkg.name || fallback.name,
      description: pkg.description || fallback.description,
      version: pkg.version || fallback.version,
    };
  } catch {
    return fallback;
  }
}

export function detectRouterType(projectRoot: string): 'app' | 'pages' | 'both' {
  const hasApp =
    fs.existsSync(path.join(projectRoot, 'app')) ||
    fs.existsSync(path.join(projectRoot, 'src', 'app'));
  const hasPages =
    fs.existsSync(path.join(projectRoot, 'pages')) ||
    fs.existsSync(path.join(projectRoot, 'src', 'pages'));
  if (hasApp && hasPages) return 'both';
  if (hasApp) return 'app';
  return 'pages';
}

export function isNextProject(projectRoot: string): boolean {
  const packagePath = path.join(projectRoot, 'package.json');
  try {
    const raw = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const deps = { ...raw.dependencies, ...raw.devDependencies };
    return typeof deps?.next === 'string';
  } catch {
    return false;
  }
}

export function getPublicDir(projectRoot: string): string {
  return path.join(projectRoot, 'public');
}

export function getPwaOutputDir(config: ResolvedConfig): string {
  return path.join(getPublicDir(config.projectRoot), config.pwaDir);
}

export function formatAppName(name: string): string {
  return name
    .replace(/^@[^/]+\//, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
