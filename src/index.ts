import * as fs from 'fs';
import * as path from 'path';
import { getPublicDir, getPwaOutputDir, isNextProject, readJsonFile, resolveConfig } from './config';
import { ensureDir, findSourceIcon } from './icons/utils';
import { generateManifest, writeManifest } from './manifest';
import { generateOfflinePage } from './offline';
import { createSWWebpackPlugin, generateSWRegisterFile } from './sw';
import { ManifestIcon, NextConfig, PWAAutoConfig } from './types';

type BundlerMode = 'webpack' | 'turbopack';

function withPWAAuto(pwaConfig: PWAAutoConfig = {}) {
  const config = resolveConfig(pwaConfig);
  if (!isNextProject(config.projectRoot)) {
    throw new Error(
      'next-pwa-auto only works in a Next.js project. Ensure Next.js is installed and run this from a Next.js app directory.'
    );
  }

  if (config.disable) {
    return (nextConfig: NextConfig = {}): NextConfig => nextConfig;
  }
  let preBuildComplete = false;

  const getBundlerMode = (nextConfig: NextConfig): BundlerMode => {
    const args = process.argv.map((arg) => arg.toLowerCase());
    if (args.includes('--webpack')) return 'webpack';
    if (args.includes('--turbopack') || args.includes('--turbo')) return 'turbopack';

    if (typeof nextConfig.webpack === 'function') return 'webpack';
    if (nextConfig.turbopack) return 'turbopack';

    const nextMajor = getProjectNextMajor(config.projectRoot);
    if (nextMajor === null) return 'webpack';
    return nextMajor >= 16 ? 'turbopack' : 'webpack';
  };

  const runPreBuildOnce = (dev: boolean) => {
    if (preBuildComplete) return;
    if (dev && config.disableInDev) return;
    runPreBuildTasks(config);
    preBuildComplete = true;
  };

  return (nextConfig: NextConfig = {}): NextConfig => {
    const bundler = getBundlerMode(nextConfig);
    const shouldInjectHeaders = config.routerType !== 'pages';
    const withTurbopackConfig = normalizeTurbopackConfig(nextConfig.turbopack);

    const withHeaders = async () => {
      const existingHeaders =
        typeof nextConfig.headers === 'function' ? await nextConfig.headers() : [];
      if (process.env.NODE_ENV !== 'test') {
        runPreBuildOnce(process.env.NODE_ENV === 'development');
      }
      return [
        ...existingHeaders,
        {
          source: '/manifest.webmanifest',
          headers: [
            {
              key: 'Content-Type',
              value: 'application/manifest+json',
            },
            {
              key: 'Cache-Control',
              value: 'public, max-age=0, must-revalidate',
            },
          ],
        },
        {
          source: `/${config.swDest}`,
          headers: [
            {
              key: 'Cache-Control',
              value: 'public, max-age=0, must-revalidate',
            },
            {
              key: 'Service-Worker-Allowed',
              value: config.scope,
            },
          ],
        },
      ];
    };

    if (bundler === 'webpack') {
      return {
        ...nextConfig,
        webpack(webpackConfig: any, context: any) {
          const { isServer, dev } = context;
          if (typeof nextConfig.webpack === 'function') {
            webpackConfig = nextConfig.webpack(webpackConfig, context);
          }
          if (isServer) return webpackConfig;
          if (dev && config.disableInDev) {
            return webpackConfig;
          }
          runPreBuildOnce(dev);
          const swPlugin = createSWWebpackPlugin(config);
          if (swPlugin) {
            webpackConfig.plugins.push(swPlugin);
          }
          return webpackConfig;
        },
        ...(withTurbopackConfig ? { turbopack: withTurbopackConfig } : {}),
        ...(shouldInjectHeaders
          ? {
              async headers() {
                return withHeaders();
              },
            }
          : {}),
      };
    }

    return {
      ...nextConfig,
      ...(withTurbopackConfig ? { turbopack: withTurbopackConfig } : { turbopack: {} }),
      ...(shouldInjectHeaders
        ? {
            async headers() {
              return withHeaders();
            },
          }
        : {}),
    };
  };
}

function getProjectNextMajor(projectRoot: string): number | null {
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const raw = readJsonFile(packageJsonPath);
    const nextVersion = raw?.dependencies?.next || raw?.devDependencies?.next;
    if (typeof nextVersion !== 'string') return null;
    const match = nextVersion.match(/\d+/);
    return match ? Number(match[0]) : null;
  } catch {
    return null;
  }
}

function normalizeTurbopackConfig(turbopackConfig: NextConfig['turbopack']): any | null {
  if (!turbopackConfig) {
    return null;
  }
  if (typeof turbopackConfig === 'function') {
    return (config: any, options: any) => {
      const maybeConfig = turbopackConfig(config, options);
      return maybeConfig || config;
    };
  }
  return { ...turbopackConfig };
}

function runPreBuildTasks(config: ReturnType<typeof resolveConfig>): void {
  console.log('');
  console.log('[next-pwa-auto]  ' + String.fromCodePoint(0x1f680) + ' Generating PWA assets...');
  const publicDir = getPublicDir(config.projectRoot);
  const pwaDir = getPwaOutputDir(config);
  ensureDir(pwaDir);
  let icons: ManifestIcon[] = [];
  const iconsDir = path.join(pwaDir, 'icons');
  const existingIcons = fs.existsSync(iconsDir)
    ? fs.readdirSync(iconsDir).filter((f) => f.endsWith('.png'))
    : [];
  const forceRegenIcons = process.env.NEXT_PWA_AUTO_FORCE_ICON_REGEN === '1';
  const shouldGenerateFromSource =
    Boolean(config.icon) || Boolean(findSourceIcon(publicDir)) || forceRegenIcons;
  const shouldPreserveIcons = existingIcons.length > 0 && !shouldGenerateFromSource;
  const shouldGenerateIcons = existingIcons.length === 0 || shouldGenerateFromSource;

  if (fs.existsSync(iconsDir)) {
    icons = existingIcons.map((filename) => {
      const match = filename.match(/^icon-(\d+)x(\d+)(-maskable)?(?:-([a-z0-9-]+))?\.png$/i);
      if (match) {
        return {
          src: `/${config.pwaDir}/icons/${filename}`,
          sizes: `${match[1]}x${match[2]}`,
          type: 'image/png',
          purpose: match[3] ? ('maskable' as const) : ('any' as const),
        };
      }
      return {
        src: `/${config.pwaDir}/icons/${filename}`,
        sizes: '192x192',
        type: 'image/png',
      };
    });
  }
  if (shouldGenerateIcons) {
    const existingFiles = fs.existsSync(iconsDir)
      ? fs.readdirSync(iconsDir).filter((f) => f.endsWith('.png'))
      : [];
    existingFiles.forEach((iconFile) => {
      fs.unlinkSync(path.join(iconsDir, iconFile));
    });
    icons = scheduleIconGeneration(config);
  } else if (shouldPreserveIcons) {
    console.log(
      '[next-pwa-auto] ' + String.fromCodePoint(0x267B) + ' Reusing existing generated icons.'
    );
  }
  const manifest = generateManifest(config, icons);
  writeManifest(manifest, config.projectRoot);
  console.log(
    '[next-pwa-auto] ' + String.fromCodePoint(0x2705) + ' Generated manifest.webmanifest'
  );
  generateOfflinePage(config);
  const registerScript = generateSWRegisterFile(`/${config.swDest}`, config.scope);
  const registerPath = path.join(pwaDir, 'sw-register.js');
  fs.writeFileSync(registerPath, registerScript, 'utf-8');
  console.log(
    '[next-pwa-auto] ' + String.fromCodePoint(0x2705) + ' Generated SW registration script'
  );
  console.log('[next-pwa-auto] ' + String.fromCodePoint(0x2705) + ' PWA assets ready');
  console.log('');
}

function scheduleIconGeneration(config: ReturnType<typeof resolveConfig>): ManifestIcon[] {
  const iconManifestPath = path.join(
    config.projectRoot,
    'public',
    config.pwaDir,
    '.icon-manifest.json'
  );
  try {
    const { execSync } = require('child_process');
    const scriptPath = path.join(__dirname, '_generate-icons.js');
    const script = `
const path = require('path');
const { generateIcons } = require(path.join('${__dirname.replace(/\\/g, '\\\\')}', 'icons'));
const config = ${JSON.stringify({
      ...config,
      workbox: undefined,
      cacheStrategies: undefined,
    })};
config.workbox = {};
config.cacheStrategies = {};

generateIcons(config).then((result) => {
  if (result) {
    const fs = require('fs');
    const outputPath = path.join('${config.projectRoot.replace(/\\/g, '\\\\')}', 'public', '${config.pwaDir}', '.icon-manifest.json');
    fs.writeFileSync(outputPath, JSON.stringify(result.icons, null, 2));
  }
}).catch(console.error);
`;
    fs.writeFileSync(scriptPath, script, 'utf-8');
    execSync(`node "${scriptPath}"`, {
      cwd: config.projectRoot,
      stdio: 'inherit',
      timeout: 30000,
    });
    if (fs.existsSync(iconManifestPath)) {
      const icons = JSON.parse(fs.readFileSync(iconManifestPath, 'utf-8')) as ManifestIcon[];
      fs.unlinkSync(iconManifestPath);
      return icons;
    }
  } catch (e) {
    console.warn(
      '[next-pwa-auto] ' + String.fromCodePoint(0x26a0, 0xfe0f) + '  Icon generation failed:',
      (e as Error).message
    );
    console.warn(
      '[next-pwa-auto] ' +
        String.fromCodePoint(0x2139, 0xfe0f) +
        '  Run `npx next-pwa-auto doctor` to diagnose issues'
    );
  } finally {
    const scriptPath = path.join(__dirname, '_generate-icons.js');
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
    if (fs.existsSync(iconManifestPath)) {
      fs.unlinkSync(iconManifestPath);
    }
  }
  return [];
}

export type { PWAAutoConfig } from './types';
export default withPWAAuto;
