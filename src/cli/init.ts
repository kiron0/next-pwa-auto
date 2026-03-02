import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { detectRouterType, getPublicDir, readPackageJson } from '../config';
import { findSourceIcon } from '../icons/utils';

export async function runInit(): Promise<void> {
  const projectRoot = process.cwd();
  console.log('');
  console.log(chalk.bold.blue('🚀 next-pwa-auto init'));
  console.log(chalk.gray('─'.repeat(45)));
  console.log('');
  const pkg = readPackageJson(projectRoot);
  const routerType = detectRouterType(projectRoot);
  const publicDir = getPublicDir(projectRoot);
  console.log(chalk.bold('  Project:'), chalk.cyan(pkg.name));
  console.log(
    chalk.bold('  Router: '),
    chalk.cyan(
      routerType === 'both' ? 'App + Pages' : routerType === 'app' ? 'App Router' : 'Pages Router'
    )
  );
  console.log('');
  const nextConfigFiles = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.mts',
  ];
  const foundConfig = nextConfigFiles.find((f) => fs.existsSync(path.join(projectRoot, f)));
  if (foundConfig) {
    const configPath = path.join(projectRoot, foundConfig);
    const content = fs.readFileSync(configPath, 'utf-8');
    const alreadyHasPlugin = content.includes('next-pwa-auto') || content.includes('withPWAAuto');
    if (alreadyHasPlugin) {
      console.log(chalk.green('  ✅ next-pwa-auto already configured in'), chalk.bold(foundConfig));
    } else {
      const injected = injectPluginIntoConfig(content, foundConfig);
      if (injected) {
        fs.writeFileSync(configPath, injected, 'utf-8');
        console.log(chalk.green('  ✅ Added withPWAAuto() to'), chalk.bold(foundConfig));
      } else {
        console.log(chalk.yellow('  ⚠️  Could not auto-inject into'), chalk.bold(foundConfig));
        console.log(chalk.gray('     Please add manually:'));
        printManualSetupInstructions(foundConfig, routerType);
      }
    }
  } else {
    const configContent = `import withPWAAuto from 'next-pwa-auto';
const nextConfig = {};

export default withPWAAuto()(nextConfig);
`;
    fs.writeFileSync(path.join(projectRoot, 'next.config.mjs'), configContent, 'utf-8');
    console.log(
      chalk.green('  ✅ Created'),
      chalk.bold('next.config.mjs'),
      chalk.green('with withPWAAuto()')
    );
  }
  const sourceIcon = findSourceIcon(publicDir);
  if (sourceIcon) {
    console.log(chalk.green('  ✅ Source icon found:'), chalk.bold(path.basename(sourceIcon)));
  } else {
    console.log(chalk.yellow('  ℹ  No source icon found — a placeholder will be auto-generated.'));
    console.log(chalk.gray('     For best results, place a 512×512+ PNG as public/icon.png'));
  }
  const layoutInjected = injectPWAHead(projectRoot, routerType);
  if (layoutInjected === 'already') {
    console.log(chalk.green('  ✅ PWAHead already present in layout'));
  } else if (layoutInjected === 'injected') {
    console.log(chalk.green('  ✅ Added <PWAHead /> to layout'));
  } else {
    console.log(chalk.yellow('  ℹ  Add <PWAHead /> to your layout manually:'));
    if (routerType === 'app' || routerType === 'both') {
      console.log(chalk.gray("     import { PWAHead } from 'next-pwa-auto/head';"));
      console.log(chalk.gray('     Add <PWAHead /> inside <head> in app/layout.tsx'));
    } else {
      console.log(chalk.gray("     import { PWAHead } from 'next-pwa-auto/head';"));
      console.log(chalk.gray('     Add <PWAHead /> in pages/_app.tsx'));
    }
  }
  console.log('');
  console.log(chalk.gray('─'.repeat(45)));
  console.log(chalk.green.bold('  ✨ Setup complete!'));
  console.log('');
  console.log(chalk.gray('  Next steps:'));
  console.log(
    chalk.gray('  1. Run'),
    chalk.cyan('next build'),
    chalk.gray('to generate PWA assets')
  );
  console.log(
    chalk.gray('  2. Run'),
    chalk.cyan('npx next-pwa-auto doctor'),
    chalk.gray('to verify setup')
  );
  console.log(chalk.gray('  3. Deploy with HTTPS for full PWA support'));
  console.log('');
}

function injectPluginIntoConfig(content: string, filename: string): string | null {
  const isTS = filename.endsWith('.ts') || filename.endsWith('.mts');
  const isESM = filename.endsWith('.mjs') || filename.endsWith('.mts');
  if (isESM || isTS) {
    const importLine = `import withPWAAuto from 'next-pwa-auto';\n`;
    if (content.includes('export default')) {
      const modified =
        importLine + content.replace(/export default\s+/, 'export default withPWAAuto()(');
      if (modified.endsWith(';\n') || modified.endsWith(';')) {
        const trimmed = modified.replace(/;?\s*$/, '');
        return trimmed + ');\n';
      }
      return modified + ');\n';
    }
  } else {
    const requireLine = `const withPWAAuto = require('next-pwa-auto');\n`;
    if (content.includes('module.exports')) {
      const modified =
        requireLine + content.replace(/module\.exports\s*=\s*/, 'module.exports = withPWAAuto()(');
      if (modified.endsWith(';\n') || modified.endsWith(';')) {
        const trimmed = modified.replace(/;?\s*$/, '');
        return trimmed + ');\n';
      }
      return modified + ');\n';
    }
  }
  return null;
}

function injectPWAHead(
  projectRoot: string,
  routerType: 'app' | 'pages' | 'both'
): 'injected' | 'already' | null {
  if (routerType === 'app' || routerType === 'both') {
    const layoutPaths = [
      path.join(projectRoot, 'app', 'layout.tsx'),
      path.join(projectRoot, 'app', 'layout.jsx'),
      path.join(projectRoot, 'src', 'app', 'layout.tsx'),
      path.join(projectRoot, 'src', 'app', 'layout.jsx'),
    ];
    for (const layoutPath of layoutPaths) {
      if (fs.existsSync(layoutPath)) {
        const content = fs.readFileSync(layoutPath, 'utf-8');
        if (content.includes('PWAHead')) {
          return 'already';
        }
        const importLine = `import { PWAHead } from 'next-pwa-auto/head';\n`;
        let modified = importLine + content;
        if (modified.includes('<head>')) {
          modified = modified.replace('<head>', '<head>\n        <PWAHead />');
          fs.writeFileSync(layoutPath, modified, 'utf-8');
          return 'injected';
        }
        if (modified.match(/<head\s/)) {
          modified = modified.replace(/<head([^>]*)>/, '<head$1>\n        <PWAHead />');
          fs.writeFileSync(layoutPath, modified, 'utf-8');
          return 'injected';
        }
      }
    }
  }
  return null;
}

function printManualSetupInstructions(configFile: string, routerType: string): void {
  const isESM = configFile.endsWith('.mjs') || configFile.endsWith('.mts');
  console.log('');
  if (isESM) {
    console.log(chalk.gray("     import withPWAAuto from 'next-pwa-auto';"));
    console.log(chalk.gray('     export default withPWAAuto()(nextConfig);'));
  } else {
    console.log(chalk.gray("     const withPWAAuto = require('next-pwa-auto');"));
    console.log(chalk.gray('     module.exports = withPWAAuto()(nextConfig);'));
  }
}
