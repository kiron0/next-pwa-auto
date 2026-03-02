import * as fs from 'fs';
import * as path from 'path';
import { getPublicDir, getPwaOutputDir, resolveConfig } from './config';
import { ensureDir } from './icons/utils';
import { generateManifest, writeManifest } from './manifest';
import { generateOfflinePage } from './offline';
import { createSWWebpackPlugin, generateSWRegisterFile } from './sw';
import { ManifestIcon, NextConfig, PWAAutoConfig } from './types';

function withPWAAuto(pwaConfig: PWAAutoConfig = {}) {
  const config = resolveConfig(pwaConfig);
  if (config.disable) {
    return (nextConfig: NextConfig = {}): NextConfig => nextConfig;
  }
  let preBuildComplete = false;
  return (nextConfig: NextConfig = {}): NextConfig => {
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
        if (!preBuildComplete) {
          runPreBuildTasks(config);
          preBuildComplete = true;
        }
        const swPlugin = createSWWebpackPlugin(config);
        if (swPlugin) {
          webpackConfig.plugins.push(swPlugin);
        }
        return webpackConfig;
      },
      ...(config.routerType !== 'pages'
        ? {
            async headers() {
              const existingHeaders =
                typeof nextConfig.headers === 'function' ? await nextConfig.headers() : [];
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
            },
          }
        : {}),
    };
  };
}

function runPreBuildTasks(config: ReturnType<typeof resolveConfig>): void {
  console.log('');
  console.log('[next-pwa-auto] 🚀 Generating PWA assets...');
  const publicDir = getPublicDir(config.projectRoot);
  const pwaDir = getPwaOutputDir(config);
  ensureDir(pwaDir);
  let icons: ManifestIcon[] = [];
  const iconsDir = path.join(pwaDir, 'icons');
  if (fs.existsSync(iconsDir)) {
    const existingIcons = fs.readdirSync(iconsDir).filter((f) => f.endsWith('.png'));
    icons = existingIcons.map((filename) => {
      const match = filename.match(/icon-(\d+)x(\d+)(-maskable)?\.png/);
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
  if (icons.length === 0) {
    icons = scheduleIconGeneration(config);
  }
  const manifest = generateManifest(config, icons);
  writeManifest(manifest, config.projectRoot);
  console.log('[next-pwa-auto] ✅ Generated manifest.webmanifest');
  generateOfflinePage(config);
  const registerScript = generateSWRegisterFile(`/${config.swDest}`, config.scope);
  const registerPath = path.join(pwaDir, 'sw-register.js');
  fs.writeFileSync(registerPath, registerScript, 'utf-8');
  console.log('[next-pwa-auto] ✅ Generated SW registration script');
  console.log('[next-pwa-auto] ✅ PWA assets ready');
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
    console.warn('[next-pwa-auto] ⚠ Icon generation failed:', (e as Error).message);
    console.warn('[next-pwa-auto] ℹ Run `npx next-pwa-auto doctor` to diagnose issues');
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
export default withPWAAuto;

export type { PWAAutoConfig } from './types';
export { withPWAAuto };
