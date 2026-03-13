#!/usr/bin/env node

import { Command } from 'commander';
import { runDoctor } from './doctor';
import { runInit } from './init';
import chalk from 'chalk';
import packageJson from '../../package.json';

const program = new Command();
let didHandleGracefulExit = false;

function printGracefulExit(): never {
  if (didHandleGracefulExit) {
    process.exit(0);
  }
  didHandleGracefulExit = true;
  console.log('');
  console.log(chalk.gray('-'.repeat(45)));
  console.log(chalk.green.bold('  Thanks for using next-pwa-auto'));
  console.log(chalk.gray('  We appreciate you trusting us to set up your PWA experience.'));
  process.exit(0);
}

process.once('SIGINT', () => {
  printGracefulExit();
});
process.once('SIGTERM', () => {
  printGracefulExit();
});

const cliVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
const cliDescription =
  typeof packageJson.description === 'string'
    ? packageJson.description
    : 'next-pwa-auto CLI';

program.name('next-pwa-auto').description(cliDescription).version(cliVersion);
program
  .command('doctor')
  .description('Check PWA setup and diagnose issues')
  .option('--fix', 'Attempt safe automatic fixes for common setup issues')
  .action(async (options: { fix?: boolean }) => {
    const result = await runDoctor({ fix: options.fix === true });
    if (result.failCount > 0) {
      process.exitCode = 1;
    }
  });
program
  .command('init')
  .description('Set up next-pwa-auto in your Next.js project')
  .option('--skip', 'Run init with defaults (auto mode)')
  .option('--check', 'Dry run: print what init would change without mutating files')
  .option('--quiet', 'Reduce output in check mode')
  .option('--force', 'Force reconfigure when init would otherwise skip because already configured')
  .action(async (options: { skip?: boolean; check?: boolean; quiet?: boolean; force?: boolean }) => {
    const result = await runInit({
      skip: options.skip === true,
      check: options.check === true,
      quiet: options.quiet === true,
      force: options.force === true,
    });
    if (result.hasBlockingIssues) {
      process.exitCode = 1;
    }
  });

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('  ?'), chalk.red(message));
    process.exitCode = 1;
    return;
  }

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

void main();
