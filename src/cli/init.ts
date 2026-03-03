import { confirm, isCancel, select } from '@clack/prompts';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { detectRouterType, getPublicDir, isNextProject, readPackageJson } from '../config';
import {
  canSkipIfConfigured,
  collectPWASetupChecks,
} from './setup-checks';
import {
  APP_LAYOUT_PATH_HINT,
  findNextConfigFile,
  findTopLevelAppLayout,
  hasPWAHeadInFile,
  hasGeneratedPwaIcons,
  PWA_ICONS_PATH_PRETTY,
  findTopLevelPagesLayout,
} from './setup-discovery';

const PACKAGE_NAME = 'next-pwa-auto';
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.avif',
  '.bmp',
]);
const PLACEHOLDER_ICON_VALUE = '__placeholder__';
const KEEP_GENERATED_ICONS_VALUE = '__keep_generated_icons__';
type IconSelection = {
  iconPath: string | null;
  reuseExistingIcons: boolean;
  forceRegenerateIcons: boolean;
};

interface InitOptions {
  skip?: boolean;
  force?: boolean;
}

type ConfigUpdateResult = 'already' | 'updated' | 'manual';

export class InitCancelledError extends Error {
  constructor(message = 'Setup was cancelled by user') {
    super(message);
    this.name = 'InitCancelledError';
  }
}

const HEADER_ICON = '\u{1F680}';
const COMPLETE_ICON = '\u{2705}';

export async function runInit(options: InitOptions | boolean = false): Promise<void> {
  const skip = typeof options === 'boolean' ? options : options.skip === true;
  const force = typeof options === 'boolean' ? false : options.force === true;
  const projectRoot = process.cwd();

  if (!isNextProject(projectRoot)) {
    console.log(chalk.red('  ?'), chalk.red('Not a Next.js project'));
    throw new Error('next-pwa-auto init can only be used in a Next.js project.');
  }

  const pkg = readPackageJson(projectRoot);
  const routerType = detectRouterType(projectRoot);
  const publicDir = getPublicDir(projectRoot);

  try {
    console.log('');
    console.log(chalk.bold.blue(`${HEADER_ICON} next-pwa-auto init`));
    console.log(chalk.gray('-'.repeat(45)));
    console.log('');
    console.log(chalk.bold('  Project:'), chalk.cyan(pkg.name));
    console.log(
      chalk.bold('  Router: '),
      chalk.cyan(routerType === 'app' ? 'App Router' : 'Pages Router')
    );
    console.log('');
    const setupChecks = collectPWASetupChecks(projectRoot, routerType);
    const canTreatAsConfigured = canSkipIfConfigured(setupChecks, routerType, projectRoot);

    if (!skip) {
      await askConfirm('Set up next-pwa-auto in this project?', true);
      if (canTreatAsConfigured) {
        const reconfigure = await askConfirm(
          'next-pwa-auto is already configured. Setup again?',
          false
        );
        if (!reconfigure) {
          throw new InitCancelledError(
            'Setup skipped because next-pwa-auto is already configured.'
          );
        }
      }
    } else {
      if (canTreatAsConfigured && !force) {
        console.log(
          chalk.yellow('  next-pwa-auto is already configured. Use --skip --force to reconfigure.')
        );
        throw new InitCancelledError(
          'Setup skipped because next-pwa-auto is already configured. Use --skip --force to reconfigure.'
        );
      }
    }

    await ensurePackageInstalled(projectRoot);

    const hasExistingGeneratedIcons = hasGeneratedPwaIcons(projectRoot);
    const selectedIcon = skip
      ? { iconPath: null, reuseExistingIcons: false, forceRegenerateIcons: false }
      : await pickSourceIcon(projectRoot, publicDir, hasExistingGeneratedIcons);

    const configUpdateResult = updateNextConfig(projectRoot);
    if (configUpdateResult === 'already') {
      console.log(
        chalk.green('  ?'),
        chalk.gray('next-pwa-auto already configured in next.config')
      );
    } else if (configUpdateResult === 'updated') {
      console.log(chalk.green('  ?'), chalk.gray('Updated next config to use withPWAAuto'));
    } else {
      const configFile = findNextConfigFile(projectRoot) || 'next.config.mjs';
      console.log(chalk.yellow('  ?'), chalk.gray('Could not auto-update config, manual setup:'));
      printManualSetupInstructions(configFile, routerType);
    }

    if (selectedIcon.iconPath) {
      console.log(
        chalk.green('  ?'),
        chalk.gray('Selected icon:'),
        chalk.cyan(selectedIcon.iconPath)
      );
    } else if (selectedIcon.reuseExistingIcons) {
      console.log(
        chalk.green('  ?'),
        chalk.gray(`Using existing generated icons at ${PWA_ICONS_PATH_PRETTY}.`)
      );
      console.log(
        chalk.yellow('  ?'),
        chalk.yellow(
          'Keep existing icons enabled. Existing icons will be reused and not regenerated.'
        )
      );
    } else {
      console.log(
        chalk.yellow('  ?'),
        chalk.gray('No source icon selected. Placeholder will be used.')
      );
      if (hasExistingGeneratedIcons) {
        console.log(
          chalk.yellow('  ?'),
          chalk.yellow(
            `If generated icons exist at ${PWA_ICONS_PATH_PRETTY}, they will be replaced by new generation.`
          )
        );
      }
    }

    const layoutPath =
      routerType === 'app' ? findTopLevelAppLayout(projectRoot) : findTopLevelPagesLayout(projectRoot);
    const layoutHint = layoutPath
      ? path.relative(projectRoot, layoutPath)
      : routerType === 'app'
        ? 'app layout'
        : 'pages/_app';
    const hasPWAHead = Boolean(layoutPath && hasPWAHeadInFile(layoutPath));

    if (hasPWAHead) {
      console.log(
        chalk.yellow('  ?'),
        chalk.yellow(`Detected existing <PWAHead /> in ${layoutHint}.`)
      );
    }

    if (!hasPWAHead) {
      const injected = injectPWAHead(projectRoot, routerType);
      if (injected === 'already') {
        console.log(chalk.green('  ?'), chalk.gray('PWAHead already present in layout'));
      } else if (injected === 'injected') {
        console.log(chalk.green('  ?'), chalk.gray('Added <PWAHead /> to layout'));
      } else {
        console.log(chalk.yellow('  ?'), chalk.gray('Could not auto-add <PWAHead />. Manual:'));
        printPWAHeadManualInstructions(routerType);
      }
    }

    const shouldRunBuild =
      skip || (await askConfirm('Run next build now to generate PWA assets?', true));
    if (shouldRunBuild) {
      const buildCommand = getBuildCommand(projectRoot);
      const buildEnv =
        !skip && (selectedIcon.iconPath || selectedIcon.forceRegenerateIcons)
          ? {
              ...process.env,
              ...(selectedIcon.iconPath ? { NEXT_PWA_AUTO_ICON: selectedIcon.iconPath } : {}),
              ...(selectedIcon.forceRegenerateIcons
                ? { NEXT_PWA_AUTO_FORCE_ICON_REGEN: '1' }
                : {}),
            }
          : process.env;
      try {
        run(buildCommand, { cwd: projectRoot, stdio: 'inherit', env: buildEnv });
      } catch (error) {
        console.log(chalk.red('  ?'), chalk.red(`${buildCommand} failed`));
        if (process.env.NODE_ENV !== 'test') {
          console.log((error as Error).message);
        }
      }
    }

    const shouldRunDoctor = skip || (await askConfirm('Run next-pwa-auto doctor now?', true));
    if (shouldRunDoctor) {
      const localCli = path.join(
        projectRoot,
        'node_modules',
        PACKAGE_NAME,
        'dist',
        'cli',
        'index.js'
      );
      const doctorCommand = fs.existsSync(localCli)
        ? `node "${localCli}" doctor`
        : 'npx next-pwa-auto doctor';
      try {
        run(doctorCommand, { cwd: projectRoot, stdio: 'inherit' });
      } catch (error) {
        console.log(chalk.yellow('  ?'), chalk.yellow('Doctor command failed or is unavailable.'));
        if (process.env.NODE_ENV !== 'test') {
          console.log((error as Error).message);
        }
      }
    }

    console.log('');
    console.log(chalk.gray('-'.repeat(45)));
    console.log(chalk.green.bold(`  ${COMPLETE_ICON} Setup complete!`));
    console.log('');
    console.log(chalk.gray('  Deploy with HTTPS for full PWA support'));
    console.log('');
  } catch (error) {
    if (error instanceof InitCancelledError) {
      printCancelledMessage();
      return;
    }

    throw error;
  }
}

function askConfirm(message: string, initialValue = true): Promise<boolean> {
  return Promise.resolve(confirm({ message, initialValue })).then((value) => {
    if (isCancel(value)) {
      throw new InitCancelledError();
    }
    return value;
  });
}

async function pickSourceIcon(
  projectRoot: string,
  publicDir: string,
  warnOnOverwrite: boolean
): Promise<IconSelection> {
  if (!fs.existsSync(publicDir)) {
    return { iconPath: null, reuseExistingIcons: false, forceRegenerateIcons: false };
  }

  const publicIcons = listPublicIcons(publicDir);
  if (publicIcons.length === 0) {
    if (warnOnOverwrite) {
      console.log(
        chalk.gray(
          '  ? Existing generated icons were found, but selecting a source icon from public/ is optional.'
        )
      );
      console.log(
        chalk.gray(
          '     This is okay: existing generated icons will be reused when no new source icon is selected.'
        )
      );
    }
    return {
      iconPath: null,
      reuseExistingIcons: warnOnOverwrite,
      forceRegenerateIcons: warnOnOverwrite,
    };
  }

  if (warnOnOverwrite) {
    console.log(
      chalk.yellow('  ?'),
      chalk.yellow(`Detected existing generated icons at ${PWA_ICONS_PATH_PRETTY}.`)
    );
    console.log(
      chalk.gray(
        '     If you select an icon again, previously generated _pwa/icons files will be replaced.'
      )
    );
  }

  const options = [
    { value: PLACEHOLDER_ICON_VALUE, label: 'Use placeholder icon (auto-generated)' },
    ...(warnOnOverwrite
      ? [{ value: KEEP_GENERATED_ICONS_VALUE, label: 'Keep existing generated icons and continue' }]
      : []),
    ...publicIcons.map((icon) => ({ value: icon, label: icon })),
  ];

  const selectIcon = async (): Promise<IconSelection> => {
    const selected = (await select({
      message: 'Select icon file from public/ (or choose placeholder):',
      options,
    })) as string | null;

    if (isCancel(selected)) {
      throw new InitCancelledError();
    }

    if (selected === PLACEHOLDER_ICON_VALUE) {
      const confirmPlaceholder = await askConfirm(
        `You selected placeholder but ${publicIcons.length} icon image(s) already exist in public/. Proceed with placeholder?`,
        false
      );
      if (!confirmPlaceholder) {
        return selectIcon();
      }
      return { iconPath: null, reuseExistingIcons: false, forceRegenerateIcons: true };
    }

    if (selected === KEEP_GENERATED_ICONS_VALUE) {
      return { iconPath: null, reuseExistingIcons: true, forceRegenerateIcons: false };
    }

    if (selected && typeof selected === 'string') {
      const source = path.join('public', selected).replace(/\\/g, '/');
      if (fs.existsSync(path.join(projectRoot, source))) {
        return {
          iconPath: source,
          reuseExistingIcons: false,
          forceRegenerateIcons: true,
        };
      }
    }

    return { iconPath: null, reuseExistingIcons: false, forceRegenerateIcons: false };
  };

  return selectIcon();
}

function listPublicIcons(publicDir: string): string[] {
  const items = fs.readdirSync(publicDir, { withFileTypes: true });
  return items
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function ensurePackageInstalled(projectRoot: string): Promise<void> {
  if (isPackageInstalled(projectRoot)) {
    console.log(chalk.green('  ?'), chalk.gray('next-pwa-auto found in dependencies'));
    return Promise.resolve();
  }

  const { label, command } = detectPackageManager(projectRoot);
  console.log(chalk.gray(`  installing next-pwa-auto via ${label}...`));
  run(command, { cwd: projectRoot, stdio: 'inherit' });
  return Promise.resolve();
}

function detectPackageManager(projectRoot: string): { label: string; command: string } {
  const manifestManager = getPackageManagerFromManifest(projectRoot);
  if (manifestManager) {
    return manifestManager;
  }

  const entries = fs.readdirSync(projectRoot);
  if (entries.includes('bun.lock')) return { label: 'bun', command: 'bun add next-pwa-auto' };
  if (entries.includes('bun.lockb')) return { label: 'bun', command: 'bun add next-pwa-auto' };
  if (entries.includes('pnpm-lock.yaml'))
    return { label: 'pnpm', command: 'pnpm add next-pwa-auto' };
  if (entries.includes('yarn.lock')) return { label: 'yarn', command: 'yarn add next-pwa-auto' };
  if (entries.includes('package-lock.json'))
    return { label: 'npm', command: 'npm install next-pwa-auto' };
  return { label: 'npm', command: 'npm install next-pwa-auto' };
}

function getPackageManagerFromManifest(
  projectRoot: string
): { label: string; command: string } | null {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const manager = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
    const lower = manager.toLowerCase();
    if (lower.startsWith('bun@')) return { label: 'bun', command: 'bun add next-pwa-auto' };
    if (lower.startsWith('pnpm@')) return { label: 'pnpm', command: 'pnpm add next-pwa-auto' };
    if (lower.startsWith('yarn@')) return { label: 'yarn', command: 'yarn add next-pwa-auto' };
    if (lower.startsWith('npm@')) return { label: 'npm', command: 'npm install next-pwa-auto' };
  } catch {
    // ignore malformed package.json
  }

  return null;
}

function isPackageInstalled(projectRoot: string): boolean {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...raw.dependencies, ...raw.devDependencies };
    return Boolean(deps && typeof deps[PACKAGE_NAME] === 'string');
  } catch {
    return false;
  }
}

function updateNextConfig(projectRoot: string): ConfigUpdateResult {
  const configFile = findNextConfigFile(projectRoot);
  if (!configFile) {
    const content = buildNextConfigTemplate();
    fs.writeFileSync(path.join(projectRoot, 'next.config.mjs'), content, 'utf-8');
    return 'updated';
  }

  const configPath = path.join(projectRoot, configFile);
  const rawContent = fs.readFileSync(configPath, 'utf-8');
  const content = sanitizeNextConfigContent(rawContent);
  const alreadyHasPlugin = content.includes('next-pwa-auto') || content.includes('withPWAAuto');
  if (alreadyHasPlugin) {
    if (content !== rawContent) {
      fs.writeFileSync(configPath, content, 'utf-8');
      return 'updated';
    }
    return 'already';
  }

  const injected = injectPluginIntoConfig(content, configFile);
  if (!injected) {
    return 'manual';
  }
  fs.writeFileSync(configPath, injected, 'utf-8');
  return 'updated';
}

function injectPluginIntoConfig(
  content: string,
  filename: string
): string | null {
  const isTS = filename.endsWith('.ts') || filename.endsWith('.mts');
  const isESM = filename.endsWith('.mjs') || filename.endsWith('.mts');

  if (isTS || isESM) {
    const importLine = `import withPWAAuto from 'next-pwa-auto';\n`;
    if (content.includes('export default')) {
      const replacement = 'export default withPWAAuto()(';
      const modified = importLine + content.replace(/export default\s+/, replacement);
      return appendCloseBracket(modified);
    }
    return null;
  }

  const requireLine = `const withPWAAuto = require('next-pwa-auto');\n`;
  if (content.includes('module.exports')) {
    const replacement = 'module.exports = withPWAAuto()(';
    const modified = requireLine + content.replace(/module\.exports\s*=\s*/, replacement);
    return appendCloseBracket(modified);
  }

  return null;
}

function sanitizeNextConfigContent(content: string): string {
  const removedTypeImport = content.replace(
    /^\s*import\s+type\s*{\s*NextConfig\s*}\s*from\s*['"]next['"];\s*$/gm,
    ''
  );
  const removedTypeAnnotations = removedTypeImport.replace(/:\s*NextConfig(?=\s*[=\n])/g, '');
  return removedTypeAnnotations.replace(/\n{3,}/g, '\n\n');
}

function appendCloseBracket(content: string): string {
  const trimmed = content.trimEnd();
  if (trimmed.endsWith(');')) {
    return `${trimmed}\n`;
  }
  if (trimmed.endsWith(')')) {
    return `${trimmed};\n`;
  }
  if (trimmed.endsWith(';')) {
    return `${trimmed.slice(0, -1)});\n`;
  }
  return `${trimmed});\n`;
}

function getBuildCommand(projectRoot: string): string {
  const { label } = detectPackageManager(projectRoot);
  return `${label} run build`;
}

function buildNextConfigTemplate(): string {
  return "import withPWAAuto from 'next-pwa-auto';\n\nconst nextConfig = {};\n\nexport default withPWAAuto()(nextConfig);\n";
}

function injectPWAHead(
  projectRoot: string,
  routerType: 'app' | 'pages'
): 'injected' | 'already' | null {
  if (routerType !== 'app') {
    return null;
  }

  const layoutPath = findTopLevelAppLayout(projectRoot);
  if (!layoutPath) {
    return null;
  }

  const content = fs.readFileSync(layoutPath, 'utf-8');
  if (content.includes('PWAHead')) {
    return 'already';
  }

  const importLine = `import { PWAHead } from 'next-pwa-auto/head';\n`;
  let modified = importLine + content;
  const headMatch = modified.match(/<head(\s[^>]*)?>/i);
  if (headMatch && headMatch[0]) {
    const replacement = `${headMatch[0]}\n        <PWAHead />`;
    modified = modified.replace(headMatch[0], replacement);
    fs.writeFileSync(layoutPath, modified, 'utf-8');
    return 'injected';
  }

  const htmlMatch = modified.match(/<html(\s[^>]*)?>/i);
  if (htmlMatch && htmlMatch[0]) {
    const headBlock = '<head>\n        <PWAHead />\n      </head>';
    modified = modified.replace(htmlMatch[0], `${htmlMatch[0]}\n      ${headBlock}`);
    fs.writeFileSync(layoutPath, modified, 'utf-8');
    return 'injected';
  }

  const bodyMatch = modified.match(/<body(\s[^>]*)?>/i);
  if (bodyMatch && bodyMatch[0]) {
    const replacement = `<head>\n        <PWAHead />\n      </head>${bodyMatch[0]}`;
    modified = modified.replace(bodyMatch[0], replacement);
    fs.writeFileSync(layoutPath, modified, 'utf-8');
    return 'injected';
  }

  return null;
}

function printManualSetupInstructions(configFile: string, routerType: 'app' | 'pages'): void {
  const isESM = configFile.endsWith('.mjs') || configFile.endsWith('.mts');
  console.log('');
  console.log(chalk.gray('  Manual instruction:'));
  if (isESM) {
    console.log(chalk.gray("    import withPWAAuto from 'next-pwa-auto';"));
    console.log(chalk.gray('    export default withPWAAuto()(nextConfig);'));
  } else {
    console.log(chalk.gray("    const withPWAAuto = require('next-pwa-auto');"));
    console.log(chalk.gray('    module.exports = withPWAAuto()(nextConfig);'));
  }
  if (routerType === 'app') {
    console.log(chalk.gray("    import { PWAHead } from 'next-pwa-auto/head';"));
    console.log(chalk.gray(`    Add <PWAHead /> inside <head> in ${APP_LAYOUT_PATH_HINT}`));
  } else {
    console.log(chalk.gray("    import { PWAHead } from 'next-pwa-auto/head';"));
    console.log(chalk.gray('    Add <PWAHead /> in pages/_app.tsx'));
  }
}

function printPWAHeadManualInstructions(routerType: 'app' | 'pages'): void {
  if (routerType === 'app') {
    console.log(chalk.gray(`    Add <PWAHead /> inside <head> in ${APP_LAYOUT_PATH_HINT}`));
  } else {
    console.log(chalk.gray('    Add <PWAHead /> in pages/_app.tsx'));
  }
  console.log(chalk.gray("    import { PWAHead } from 'next-pwa-auto/head';"));
}

function printCancelledMessage(): void {
  console.log('');
  console.log(chalk.gray('-'.repeat(45)));
  console.log(chalk.green.bold('  Thanks for using next-pwa-auto'));
  console.log('');
}

function run(
  command: string,
  options: { cwd?: string; stdio?: 'inherit' | 'pipe'; env?: NodeJS.ProcessEnv }
): string {
  return execSync(command, {
    encoding: 'utf8',
    cwd: options.cwd ?? process.cwd(),
    stdio: options.stdio ?? 'inherit',
    env: options.env ?? process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
}
