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
  check?: boolean;
  quiet?: boolean;
  force?: boolean;
}

type ConfigUpdateResult = 'already' | 'updated' | 'manual';
type ConfigPlanResult = 'already' | 'updated' | 'manual';

interface InitRunResult {
  mode: 'apply' | 'check';
  hasBlockingIssues: boolean;
}

interface PlannedFileChange {
  action: 'create' | 'modify';
  file: string;
  reason: string;
}

interface InitCheckSummary {
  hasBlockingIssues: boolean;
  blockingIssues: string[];
  plannedFileChanges: PlannedFileChange[];
  plannedCommands: string[];
}

export class InitCancelledError extends Error {
  constructor(message = 'Setup was cancelled by user') {
    super(message);
    this.name = 'InitCancelledError';
  }
}

const HEADER_ICON = '\u{1F680}';
const COMPLETE_ICON = '\u{2705}';

export async function runInit(options: InitOptions | boolean = false): Promise<InitRunResult> {
  const skip = typeof options === 'boolean' ? options : options.skip === true;
  const check = typeof options === 'boolean' ? false : options.check === true;
  const quiet = typeof options === 'boolean' ? false : options.quiet === true;
  const force = typeof options === 'boolean' ? false : options.force === true;
  const projectRoot = process.cwd();
  const print = (...args: any[]) => {
    if (!quiet) {
      console.log(...args);
    }
  };

  if (check) {
    const summary = runInitCheck(projectRoot);
    print('');
    print(chalk.bold.blue(`${HEADER_ICON} next-pwa-auto init --check`));
    print(chalk.gray('-'.repeat(45)));
    print(chalk.gray('  Dry run mode: no files were changed.'));
    print('');

    if (summary.plannedFileChanges.length > 0 || summary.plannedCommands.length > 0) {
      print(chalk.bold('  Planned changes:'));
      for (const change of summary.plannedFileChanges) {
        print(
          `  - ${change.action.toUpperCase()} ${chalk.cyan(change.file)} ${chalk.gray(`(${change.reason})`)}`
        );
      }
      for (const command of summary.plannedCommands) {
        print(`  - RUN ${chalk.cyan(command)} ${chalk.gray('(command)')}`);
      }
    } else {
      print(chalk.green('  No changes required.'));
    }

    if (summary.hasBlockingIssues) {
      print('');
      print(chalk.red.bold('  Blocking issues found:'));
      for (const issue of summary.blockingIssues) {
        print(`  - ${chalk.red(issue)}`);
      }
    } else {
      print('');
      print(chalk.green('  No blocking issues found.'));
    }

    print('');
    return {
      mode: 'check',
      hasBlockingIssues: summary.hasBlockingIssues,
    };
  }

  if (!isNextProject(projectRoot)) {
    console.log(chalk.red('  ?'), chalk.red('Not a Next.js project'));
    throw new Error('next-pwa-auto init can only be used in a Next.js project.');
  }

  const pkg = readPackageJson(projectRoot);
  const routerType = detectRouterType(projectRoot);
  const publicDir = getPublicDir(projectRoot);

  try {
    print('');
    print(chalk.bold.blue(`${HEADER_ICON} next-pwa-auto init`));
    print(chalk.gray('-'.repeat(45)));
    print('');
    print(chalk.bold('  Project:'), chalk.cyan(pkg.name));
    print(
      chalk.bold('  Router: '),
      chalk.cyan(routerType === 'app' ? 'App Router' : 'Pages Router')
    );
    print('');
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
      print(
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

    print('');
    print(chalk.gray('-'.repeat(45)));
    print(chalk.green.bold(`  ${COMPLETE_ICON} Setup complete!`));
    print('');
    print(chalk.gray('  Deploy with HTTPS for full PWA support'));
    print('');
    return { mode: 'apply', hasBlockingIssues: false };
  } catch (error) {
    if (error instanceof InitCancelledError) {
      printCancelledMessage();
      return { mode: 'apply', hasBlockingIssues: false };
    }

    throw error;
  }
}

function runInitCheck(projectRoot: string): InitCheckSummary {
  const plannedFileChanges: PlannedFileChange[] = [];
  const plannedCommands: string[] = [];
  const blockingIssues: string[] = [];

  if (!isNextProject(projectRoot)) {
    return {
      hasBlockingIssues: true,
      blockingIssues: ['Not a Next.js project (missing `next` dependency).'],
      plannedFileChanges,
      plannedCommands,
    };
  }

  const routerType = detectRouterType(projectRoot);
  const setupChecks = collectPWASetupChecks(projectRoot, routerType);
  for (const check of setupChecks) {
    if (check.status !== 'pass' && check.impact === 'blocking') {
      blockingIssues.push(`${check.label}: ${check.message}`);
    }
  }

  if (!isPackageInstalled(projectRoot)) {
    plannedCommands.push(detectPackageManager(projectRoot).command);
  }

  const configPlan = getNextConfigPlan(projectRoot);
  plannedFileChanges.push(...configPlan.fileChanges);
  if (configPlan.result === 'manual') {
    blockingIssues.push('Could not determine safe automatic next.config transformation.');
  }

  const headPlan = getPWAHeadPlan(projectRoot, routerType);
  if (headPlan.missingLayout) {
    blockingIssues.push(
      routerType === 'app'
        ? `Missing app layout at ${APP_LAYOUT_PATH_HINT}.`
        : 'Missing pages/_app layout file.'
    );
  } else if (headPlan.layoutPath && !headPlan.hasPWAHead) {
    plannedFileChanges.push({
      action: 'modify',
      file: path.relative(projectRoot, headPlan.layoutPath).replace(/\\/g, '/'),
      reason: 'Inject <PWAHead /> into root layout',
    });
  }

  return {
    hasBlockingIssues: blockingIssues.length > 0,
    blockingIssues,
    plannedFileChanges: dedupePlannedFileChanges(plannedFileChanges),
    plannedCommands,
  };
}

function dedupePlannedFileChanges(changes: PlannedFileChange[]): PlannedFileChange[] {
  const seen = new Set<string>();
  const deduped: PlannedFileChange[] = [];

  for (const change of changes) {
    const key = `${change.action}:${change.file}:${change.reason}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(change);
  }

  return deduped;
}

function getPWAHeadPlan(
  projectRoot: string,
  routerType: 'app' | 'pages'
): { layoutPath: string | null; hasPWAHead: boolean; missingLayout: boolean } {
  const layoutPath =
    routerType === 'app' ? findTopLevelAppLayout(projectRoot) : findTopLevelPagesLayout(projectRoot);
  if (!layoutPath) {
    return { layoutPath: null, hasPWAHead: false, missingLayout: true };
  }
  return {
    layoutPath,
    hasPWAHead: hasPWAHeadInFile(layoutPath),
    missingLayout: false,
  };
}

function getNextConfigPlan(projectRoot: string): { result: ConfigPlanResult; fileChanges: PlannedFileChange[] } {
  const configFile = findNextConfigFile(projectRoot);
  if (!configFile) {
    return {
      result: 'updated',
      fileChanges: [
        {
          action: 'create',
          file: 'next.config.mjs',
          reason: 'Create next config with withPWAAuto wrapper',
        },
      ],
    };
  }

  const configPath = path.join(projectRoot, configFile);
  const rawContent = fs.readFileSync(configPath, 'utf-8');
  const content = sanitizeNextConfigContent(rawContent);
  const alreadyHasPlugin = content.includes('next-pwa-auto') || content.includes('withPWAAuto');
  const normalizedFile = configFile.replace(/\\/g, '/');

  if (alreadyHasPlugin) {
    if (content !== rawContent) {
      return {
        result: 'updated',
        fileChanges: [
          {
            action: 'modify',
            file: normalizedFile,
            reason: 'Normalize config typing for runtime compatibility',
          },
        ],
      };
    }
    return { result: 'already', fileChanges: [] };
  }

  const injected = injectPluginIntoConfig(content, configFile);
  if (injected) {
    return {
      result: 'updated',
      fileChanges: [
        {
          action: 'modify',
          file: normalizedFile,
          reason: 'Inject withPWAAuto wrapper',
        },
      ],
    };
  }

  const wrappedConfig = buildFallbackWrappedConfig(configFile, rawContent);
  if (!wrappedConfig) {
    return { result: 'manual', fileChanges: [] };
  }

  const parsed = path.parse(configFile);
  const backupFile = `${parsed.name}.base${parsed.ext}`.replace(/\\/g, '/');
  const backupPath = path.join(projectRoot, wrappedConfig.backupFileName);
  const fileChanges: PlannedFileChange[] = [
    {
      action: 'modify',
      file: normalizedFile,
      reason: 'Wrap existing config with withPWAAuto using fallback adapter',
    },
  ];
  if (!fs.existsSync(backupPath)) {
    fileChanges.push({
      action: 'create',
      file: backupFile,
      reason: 'Backup original next config',
    });
  }

  return {
    result: 'updated',
    fileChanges,
  };
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

export function updateNextConfig(projectRoot: string): ConfigUpdateResult {
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
  if (injected) {
    fs.writeFileSync(configPath, injected, 'utf-8');
    return 'updated';
  }

  const wrappedConfig = buildFallbackWrappedConfig(configFile, rawContent);
  if (!wrappedConfig) {
    return 'manual';
  }

  const backupPath = path.join(projectRoot, wrappedConfig.backupFileName);
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, rawContent, 'utf-8');
  }

  fs.writeFileSync(configPath, wrappedConfig.wrapperContent, 'utf-8');
  return 'updated';
}

function injectPluginIntoConfig(
  content: string,
  filename: string
): string | null {
  const isTS = filename.endsWith('.ts') || filename.endsWith('.mts');
  const isESM = isESMConfigFile(filename, content);

  if (isTS || isESM) {
    const importLine = `import withPWAAuto from 'next-pwa-auto';\n`;
    if (content.includes('export default')) {
      const replacement = 'export default withPWAAuto()(';
      const modified = importLine + content.replace(/export default\s+/, replacement);
      return appendCloseBracket(modified);
    }

    const namedDefaultExport = content.match(
      /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?/
    );
    if (namedDefaultExport && namedDefaultExport[1]) {
      const configIdentifier = namedDefaultExport[1];
      const modified =
        importLine +
        content.replace(
          /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?/,
          `export default withPWAAuto()(${configIdentifier});`
        );
      return modified;
    }

    const configIdentifier = findLikelyConfigIdentifier(content);
    if (configIdentifier) {
      return `${importLine}${content.trimEnd()}\n\nexport default withPWAAuto()(${configIdentifier});\n`;
    }
    return null;
  }

  const requireLine = "const withPWAAuto = require('next-pwa-auto').default;\n";
  if (content.includes('module.exports')) {
    const replacement = 'module.exports = withPWAAuto()(';
    const modified = requireLine + content.replace(/module\.exports\s*=\s*/, replacement);
    return appendCloseBracket(modified);
  }

  if (content.includes('exports.default')) {
    const replacement = 'module.exports = withPWAAuto()(';
    const modified = requireLine + content.replace(/exports\.default\s*=\s*/, replacement);
    return appendCloseBracket(modified);
  }

  const configIdentifier = findLikelyConfigIdentifier(content);
  if (configIdentifier) {
    return `${requireLine}${content.trimEnd()}\n\nmodule.exports = withPWAAuto()(${configIdentifier});\n`;
  }

  return null;
}

function isESMConfigFile(filename: string, content: string): boolean {
  if (filename.endsWith('.mjs') || filename.endsWith('.mts')) {
    return true;
  }
  if (!filename.endsWith('.js')) {
    return false;
  }
  return /\bexport\s+default\b|\bexport\s*\{|\bimport\s+/.test(content);
}

function findLikelyConfigIdentifier(content: string): string | null {
  const matches = Array.from(content.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g));
  if (matches.length === 0) {
    return null;
  }

  const names = matches.map((m) => m[1]).filter(Boolean) as string[];
  const preferred =
    names.find((name) => /^nextconfig$/i.test(name)) ||
    names.find((name) => /config/i.test(name)) ||
    names[0];

  return preferred ?? null;
}

function buildFallbackWrappedConfig(
  configFile: string,
  originalContent: string
): { backupFileName: string; wrapperContent: string } | null {
  const parsed = path.parse(configFile);
  const backupFileName = `${parsed.name}.base${parsed.ext}`;
  const isTS = configFile.endsWith('.ts') || configFile.endsWith('.mts');
  const isESM = isESMConfigFile(configFile, originalContent);

  if (isTS) {
    const importPath = `./${parsed.name}.base`;
    return {
      backupFileName,
      wrapperContent: [
        "import withPWAAuto from 'next-pwa-auto';",
        `import * as baseConfigModule from '${importPath}';`,
        '',
        'const baseConfig =',
        "  (baseConfigModule as Record<string, unknown>).default ??",
        "  (baseConfigModule as Record<string, unknown>).nextConfig ??",
        "  (baseConfigModule as Record<string, unknown>).config ??",
        '  (baseConfigModule as Record<string, unknown>);',
        '',
        'export default withPWAAuto()(baseConfig as any);',
        '',
      ].join('\n'),
    };
  }

  if (isESM) {
    return {
      backupFileName,
      wrapperContent: [
        "import withPWAAuto from 'next-pwa-auto';",
        `import * as baseConfigModule from './${backupFileName}';`,
        '',
        'const baseConfig =',
        '  baseConfigModule.default ??',
        '  baseConfigModule.nextConfig ??',
        '  baseConfigModule.config ??',
        '  baseConfigModule;',
        '',
        'export default withPWAAuto()(baseConfig);',
        '',
      ].join('\n'),
    };
  }

  if (configFile.endsWith('.js')) {
    return {
      backupFileName,
      wrapperContent: [
        "const withPWAAuto = require('next-pwa-auto').default;",
        `const baseConfigModule = require('./${backupFileName}');`,
        '',
        'const baseConfig =',
        '  (baseConfigModule && baseConfigModule.default) ||',
        '  baseConfigModule.nextConfig ||',
        '  baseConfigModule.config ||',
        '  baseConfigModule;',
        '',
        'module.exports = withPWAAuto()(baseConfig);',
        '',
      ].join('\n'),
    };
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

export function injectPWAHead(
  projectRoot: string,
  routerType: 'app' | 'pages'
): 'injected' | 'already' | null {
  if (routerType === 'app') {
    return injectPWAHeadInAppLayout(projectRoot);
  }
  return injectPWAHeadInPagesLayout(projectRoot);
}

function injectPWAHeadInAppLayout(projectRoot: string): 'injected' | 'already' | null {
  const layoutPath = findTopLevelAppLayout(projectRoot);
  if (!layoutPath) {
    return null;
  }

  const content = fs.readFileSync(layoutPath, 'utf-8');
  if (content.includes('PWAHead')) {
    return 'already';
  }

  const importLine = `import PWAHead from 'next-pwa-auto/head';\n`;
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

function injectPWAHeadInPagesLayout(projectRoot: string): 'injected' | 'already' | null {
  const appPath = findTopLevelPagesLayout(projectRoot);
  if (!appPath) {
    return null;
  }

  const content = fs.readFileSync(appPath, 'utf-8');
  if (content.includes('PWAHead')) {
    return 'already';
  }

  const importLine = `import PWAHead from 'next-pwa-auto/head';\n`;
  let modified = importLine + content;

  if (/return\s*\(\s*<>/m.test(modified)) {
    modified = modified.replace(/return\s*\(\s*<>/m, 'return (\n    <>\n      <PWAHead />');
    fs.writeFileSync(appPath, modified, 'utf-8');
    return 'injected';
  }

  if (/return\s*\(\s*<Component[\s\S]*?\/>\s*\);/m.test(modified)) {
    modified = modified.replace(
      /return\s*\(\s*(<Component[\s\S]*?\/>)\s*\);/m,
      'return (\n    <>\n      <PWAHead />\n      $1\n    </>\n  );'
    );
    fs.writeFileSync(appPath, modified, 'utf-8');
    return 'injected';
  }

  if (/return\s*<Component[\s\S]*?\/>;/m.test(modified)) {
    modified = modified.replace(
      /return\s*(<Component[\s\S]*?\/>);/m,
      'return (\n    <>\n      <PWAHead />\n      $1\n    </>\n  );'
    );
    fs.writeFileSync(appPath, modified, 'utf-8');
    return 'injected';
  }

  if (modified.includes('<Component')) {
    modified = modified.replace('<Component', '<PWAHead />\n      <Component');
    fs.writeFileSync(appPath, modified, 'utf-8');
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
    console.log(chalk.gray("    const withPWAAuto = require('next-pwa-auto').default;"));
    console.log(chalk.gray('    module.exports = withPWAAuto()(nextConfig);'));
  }
  if (routerType === 'app') {
    console.log(chalk.gray("    import PWAHead from 'next-pwa-auto/head';"));
    console.log(chalk.gray(`    Add <PWAHead /> inside <head> in ${APP_LAYOUT_PATH_HINT}`));
  } else {
    console.log(chalk.gray("    import PWAHead from 'next-pwa-auto/head';"));
    console.log(chalk.gray('    Add <PWAHead /> in pages/_app.tsx'));
  }
}

function printPWAHeadManualInstructions(routerType: 'app' | 'pages'): void {
  if (routerType === 'app') {
    console.log(chalk.gray(`    Add <PWAHead /> inside <head> in ${APP_LAYOUT_PATH_HINT}`));
  } else {
    console.log(chalk.gray('    Add <PWAHead /> in pages/_app.tsx'));
  }
  console.log(chalk.gray("    import PWAHead from 'next-pwa-auto/head';"));
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
