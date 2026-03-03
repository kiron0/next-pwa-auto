import { describe, expect, it } from 'vitest';

import { canSkipIfConfigured, SetupCheck } from '../src/cli/setup-checks';

function makeCheck(overrides: Partial<SetupCheck>): SetupCheck {
  return {
    label: 'Label',
    status: 'pass',
    message: 'ok',
    ...overrides,
  };
}

describe('setup checks', () => {
  it('allows already-configured state with only allowed minor warnings', () => {
    const checks: SetupCheck[] = [
      makeCheck({ label: 'Next config', status: 'pass', message: 'next.config.mjs uses next-pwa-auto' }),
      makeCheck({ label: 'PWAHead (app layout)', status: 'pass', message: 'Found <PWAHead />' }),
      makeCheck({ label: 'Icons', status: 'warn', message: 'Generated PWA icons are already present in public/_pwa/icons.' }),
      makeCheck({ label: 'Manifest', status: 'pass', message: 'Found public/manifest.webmanifest.' }),
      makeCheck({ label: 'Service worker', status: 'pass', message: 'Found public/sw.js.' }),
      makeCheck({ label: 'Offline page', status: 'pass', message: 'Offline fallback page exists.' }),
      makeCheck({ label: 'HTTPS', status: 'warn', message: 'Ensure HTTPS is configured for production (required for SW)' }),
    ];

    expect(canSkipIfConfigured(checks, 'app')).toBe(true);
  });

  it('blocks already-configured state when non-allowed warning exists', () => {
    const checks: SetupCheck[] = [
      makeCheck({ label: 'Next config', status: 'pass', message: 'next.config.mjs uses next-pwa-auto' }),
      makeCheck({ label: 'PWAHead (app layout)', status: 'pass', message: 'Found <PWAHead />' }),
      makeCheck({ label: 'Manifest', status: 'pass', message: 'No manifest found after build. Re-run next build with next-pwa-auto configured.' }),
      makeCheck({ label: 'Service worker', status: 'warn', message: 'Service worker not found after build. Verify webpack mode and withPWAAuto integration.' }),
      makeCheck({ label: 'Offline page', status: 'pass', message: 'Offline fallback page exists.' }),
    ];

    expect(canSkipIfConfigured(checks, 'app')).toBe(false);
  });

  it('treats icons warning as non-blocking', () => {
    const checks: SetupCheck[] = [
      makeCheck({ label: 'Next config', status: 'pass', message: 'next.config.mjs uses next-pwa-auto' }),
      makeCheck({ label: 'PWAHead (app layout)', status: 'pass', message: 'Found <PWAHead />' }),
      makeCheck({ label: 'Icons', status: 'warn', message: 'No source icon found and generated icons were not found.' }),
      makeCheck({ label: 'Manifest', status: 'pass', message: 'Found public/manifest.webmanifest.' }),
      makeCheck({ label: 'Service worker', status: 'pass', message: 'Found public/sw.js.' }),
      makeCheck({ label: 'Offline page', status: 'pass', message: 'Offline fallback page exists.' }),
    ];

    expect(canSkipIfConfigured(checks, 'app')).toBe(true);
  });
});
