#!/usr/bin/env node

import { Command } from 'commander';
import { runDoctor } from './doctor';
import { runInit } from './init';
import chalk from 'chalk';
import packageJson from '../../package.json';

const program = new Command();
let didHandleGracefulExit = false;

function printGracefulExit(message: string): never {
  if (didHandleGracefulExit) {
    process.exit(0);
  }
  didHandleGracefulExit = true;
  console.log('');
  console.log(chalk.gray('-'.repeat(45)));
  console.log(chalk.green.bold('  Thanks for using next-pwa-auto'));
  console.log(chalk.gray(`  ${message}`));
  console.log(chalk.gray('  We appreciate you trusting us to set up your PWA experience.'));
  process.exit(0);
}

process.once('SIGINT', () => {
  printGracefulExit('Operation was cancelled by your request.');
});
process.once('SIGTERM', () => {
  printGracefulExit('Process terminated by signal.');
});

const cliVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

program.name('next-pwa-auto').description('Zero-config PWA plugin for Next.js').version(cliVersion);
program
  .command('doctor')
  .description('Check PWA setup and diagnose issues')
  .action(async () => {
    await runDoctor();
  });
program
  .command('init')
  .description('Set up next-pwa-auto in your Next.js project')
  .option('--skip', 'Run init with defaults (auto mode)')
  .action(async (options: { skip?: boolean }) => {
    await runInit(options.skip === true);
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
