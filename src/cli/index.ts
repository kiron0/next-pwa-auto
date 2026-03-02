#!/usr/bin/env node

import { Command } from 'commander';
import { runDoctor } from './doctor';
import { runInit } from './init';

const program = new Command();

program.name('next-pwa-auto').description('Zero-config PWA plugin for Next.js').version('0.1.0');
program
  .command('doctor')
  .description('Check PWA setup and diagnose issues')
  .action(async () => {
    await runDoctor();
  });
program
  .command('init')
  .description('Set up next-pwa-auto in your Next.js project')
  .action(async () => {
    await runInit();
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
