import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts', 'src/head.tsx', 'src/hooks.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: 'terser',
  terserOptions: {
    compress: {
      directives: false,
    },
  },
  external: [
    'next',
    'next/script',
    'webpack',
    'workbox-webpack-plugin',
    'sharp',
    'chalk',
    'commander',
    'react',
    'react-dom',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
