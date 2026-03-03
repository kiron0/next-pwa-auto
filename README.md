<div align="center">

# next-pwa-auto

**Near-zero setup PWA plugin for Next.js 14+**

Turn any Next.js app into a Progressive Web App with one install and minimal setup.
No manual manifest. No service worker scripts. No icon generation boilerplate.

[![npm version](https://img.shields.io/npm/v/next-pwa-auto.svg)](https://www.npmjs.com/package/next-pwa-auto)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

</div>

---

## Why next-pwa-auto?

Adding PWA support to a Next.js project typically requires:

- Writing a `manifest.json` with 20+ fields by hand
- Generating 10+ icon sizes from a source image
- Configuring Workbox for service worker generation
- Setting up caching strategies that don't break SSR
- Creating an offline fallback page
- Wiring up SW registration in your app
- Debugging why the service worker cached your login page

**next-pwa-auto does all of this automatically.** Install it, wrap your config, drop in an icon, and you have a production-ready PWA.

```bash
npm install next-pwa-auto
```

```js
// next.config.js
const withPWAAuto = require('next-pwa-auto').default;
module.exports = withPWAAuto()({});
```

**That's it.** Seriously.

---

## Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [PWAHead Component](#pwahead-component)
- [Update UX Hook](#update-ux-hook)
- [Configuration](#configuration)
- [Caching Strategy](#caching-strategy)
- [CLI Tools](#cli-tools)
- [Generated Files](#generated-files)
- [Overrides & Customization](#overrides--customization)
- [Comparison with Alternatives](#comparison-with-alternatives)
- [FAQ](#faq)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

### 1. Install

```bash
# npm
npm install next-pwa-auto

# yarn
yarn add next-pwa-auto

# pnpm
pnpm add next-pwa-auto

# bun
bun add next-pwa-auto
```

### 2. Wrap your Next.js config

```js
// next.config.js (CommonJS)
const withPWAAuto = require('next-pwa-auto').default;
module.exports = withPWAAuto()({});
```

```ts
// next.config.mjs (ESM)
import withPWAAuto from 'next-pwa-auto';

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPWAAuto()(nextConfig);
```

### 3. Add PWAHead to your layout

```tsx
// app/layout.tsx (App Router)
import PWAHead from 'next-pwa-auto/head';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <PWAHead />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// pages/_app.tsx (Pages Router)
import PWAHead from 'next-pwa-auto/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <PWAHead />
      <Component {...pageProps} />
    </>
  );
}
```

### 4. Add an icon (optional)

Place a `icon.png` or `icon.svg` (512×512 recommended) in your `public/` directory. If you don't have one, **next-pwa-auto generates a placeholder icon** with your app's initials automatically.

### 5. Build & deploy

```bash
next build
```

`next-pwa-auto` auto-detects whether your project runs with Webpack or Turbopack and configures build integration accordingly.

Your app is now a PWA. ✅

---

## How It Works

When you run `next build`, next-pwa-auto automatically:

| Step                       | What Happens                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **1. Icon Generation**     | Finds your source icon (or generates a placeholder) and creates 8 standard sizes + 2 maskable variants using `sharp` |
| **2. Manifest Generation** | Reads `package.json` for name/description and generates `manifest.webmanifest` with smart defaults                   |
| **3. Offline Fallback**    | Creates a beautiful, dark-mode-aware offline page at `_pwa/offline.html`                                             |
| **4. Service Worker**      | Uses `workbox-webpack-plugin` to generate a service worker with production-safe caching strategies                   |
| **5. Registration**        | The `<PWAHead />` component handles SW registration, manifest link, Apple PWA tags, and update lifecycle             |

**In development mode**, the service worker is **disabled by default** to prevent caching headaches. Any stale service workers from previous builds are automatically unregistered.

---

## PWAHead Component

The `<PWAHead />` component is your one-stop solution for PWA metadata injection:

```tsx
import PWAHead from 'next-pwa-auto/head';

// Default setup
<PWAHead />

// With overrides
<PWAHead
  manifest="/manifest.webmanifest"
  themeColor="#ff6b35"
  swRegisterPath="/_pwa/sw-register.js"
  enableSW={true}
/>
```

**What it renders:**

- `<link rel="manifest">` — Web App Manifest link
- `<meta name="theme-color">` — Browser theme color
- `<meta name="apple-mobile-web-app-capable">` — iOS PWA support
- `<meta name="apple-mobile-web-app-status-bar-style">` — iOS status bar
- `<meta name="mobile-web-app-capable">` — Android PWA support

**What it does automatically:**

- Loads the SW registration script in production
- **Unregisters stale service workers** in development mode
- Handles update detection and activation helpers

### Props

| Prop             | Type      | Default                        | Description                         |
| ---------------- | --------- | ------------------------------ | ----------------------------------- |
| `manifest`       | `string`  | `'/manifest.webmanifest'`      | Path to manifest file               |
| `themeColor`     | `string`  | `'#000000'`                    | Browser theme color                 |
| `swRegisterPath` | `string`  | `'/_pwa/sw-register.js'`       | Path to SW registration script      |
| `enableSW`       | `boolean` | `true` in prod, `false` in dev | Force enable/disable service worker |

---

## Update UX Hook

Handle "new version available" prompts with the `usePWAUpdate` hook:

```tsx
import usePWAUpdate from 'next-pwa-auto/hooks';

function UpdateBanner() {
  const { updateAvailable, update } = usePWAUpdate();

  if (!updateAvailable) return null;

  return (
    <div className="update-banner">
      <p>A new version is available!</p>
      <button onClick={update}>Update now</button>
    </div>
  );
}
```

### Return Value

| Property          | Type                                | Description                                 |
| ----------------- | ----------------------------------- | ------------------------------------------- |
| `updateAvailable` | `boolean`                           | `true` when a new SW is waiting to activate |
| `update`          | `() => void`                        | Activates the new SW and reloads the page   |
| `registration`    | `ServiceWorkerRegistration \| null` | The raw SW registration object              |

### Global API

The SW registration script also exposes a global API for debugging:

```js
// In browser console
window.__PWA_AUTO.update(); // Trigger an update check
window.__PWA_AUTO.skipWaiting(); // Force-activate waiting SW
window.__PWA_AUTO.registration; // Raw SW registration
window.__PWA_AUTO.version; // Plugin version
```

---

## Configuration

All options are optional. Sensible defaults work out of the box.

```ts
import withPWAAuto from 'next-pwa-auto';

export default withPWAAuto({
  // Disable the plugin entirely
  disable: false,

  // Enable offline fallback page
  offline: true,

  // Source icon path (auto-detected from public/)
  icon: './public/logo.svg',

  // Manifest overrides (merged on top of auto-generated)
  manifest: {
    name: 'My Cool App',
    short_name: 'CoolApp',
    theme_color: '#ff6b35',
    background_color: '#ffffff',
    display: 'standalone',
  },

  // Cache strategy overrides
  cacheStrategies: {
    navigation: 'networkFirst',
    staticAssets: 'cacheFirst',
    images: 'staleWhileRevalidate',
    api: 'networkOnly',
  },

  // Workbox GenerateSW options
  workbox: {
    skipWaiting: true,
    clientsClaim: true,
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  },

  // Output directory for generated PWA files
  pwaDir: '_pwa',

  // Skip service worker in development
  disableInDev: true,

  // Service worker filename
  swDest: 'sw.js',

  // Service worker scope
  scope: '/',
})(nextConfig);
```

### Full Config Interface

```ts
interface PWAAutoConfig {
  disable?: boolean;
  offline?: boolean;
  icon?: string;
  manifest?: Partial<WebAppManifest>;
  workbox?: {
    skipWaiting?: boolean;
    clientsClaim?: boolean;
    maximumFileSizeToCacheInBytes?: number;
    additionalManifestEntries?: Array<{ url: string; revision: string | null }>;
    exclude?: Array<string | RegExp>;
  };
  cacheStrategies?: {
    navigation?: CacheStrategy;
    staticAssets?: CacheStrategy;
    images?: CacheStrategy;
    api?: CacheStrategy;
  };
  pwaDir?: string;
  disableInDev?: boolean;
  swDest?: string;
  scope?: string;
}

type CacheStrategy =
  | 'cacheFirst'
  | 'networkFirst'
  | 'staleWhileRevalidate'
  | 'networkOnly'
  | 'cacheOnly';
```

---

## Caching Strategy

next-pwa-auto ships with **production-safe defaults** that won't break your app:

| Route Pattern                          | Strategy                 | Why                                                                    |
| -------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| Navigation (HTML)                      | **NetworkFirst**         | Always serve fresh pages, fall back to cache offline                   |
| `/_next/static/*`                      | **CacheFirst**           | Hashed filenames = immutable, safe to cache forever                    |
| `/_next/data/*`                        | **NetworkFirst**         | Server-side data fetches, needs freshness                              |
| Images (`.jpg`, `.png`, `.webp`, etc.) | **StaleWhileRevalidate** | Show cached immediately, update in background                          |
| Fonts (`.woff2`, `.ttf`, etc.)         | **CacheFirst**           | Rarely change, safe to cache long-term                                 |
| `/api/*`                               | **NetworkOnly**          | **Never cached** — avoids caching auth tokens, session data, mutations |

### Security Exclusions

The following URL patterns are **automatically excluded** from caching to prevent security issues:

- `/auth/*`, `/oauth/*`, `/sso/*` — Authentication flows
- `/login`, `/log-in`, `/logout`, `/log-out` — Login/logout pages
- `/signin`, `/sign-in`, `/signout`, `/sign-out` — Sign in/out pages
- `/signup`, `/sign-up` — Registration pages
- `/callback` — OAuth callbacks
- `/token` — Token endpoints
- `/verify` — Email/phone verification
- `/reset-password`, `/forgot-password` — Password recovery
- `/session` — Session management
- `/api/auth/*` — NextAuth.js / Auth.js routes
- `/_next/image` — Dynamic image optimization

### Dev Mode

Service workers are **disabled by default** in `next dev` to prevent caching issues during development:

- The `<PWAHead />` component automatically **unregisters stale SWs** in dev
- Console message: `[next-pwa-auto] 🧹 Unregistered stale service workers in dev mode`
- Force-enable with environment variable: `NEXT_PWA=1 next dev`

---

## CLI Tools

### `npx next-pwa-auto doctor`

Run a full PWA health check on your project:

```bash
$ npx next-pwa-auto doctor

🩺 next-pwa-auto doctor
─────────────────────────────────────────────
  ✅ package.json: Found — name: "my-app"
  ✅ next-pwa-auto installed: Version: ^0.1.0
  ✅ Next.js config: next.config.mjs uses next-pwa-auto
  ✅ Router type: App Router detected
  ✅ Source icon: Found: icon.png (145KB)
  ✅ Manifest: Will be auto-generated from package.json
  ✅ Generated icons: 10 icons in _pwa/icons/
  ✅ Offline page: Offline fallback page ready
  
  ⚠️  HTTPS: Ensure HTTPS is configured for production (required for SW)
─────────────────────────────────────────────
  🎉 PWA setup looks good! (8 passed, 1 warnings)
```

### `npx next-pwa-auto init`

Interactive setup wizard for new projects (near-zero setup):

```bash
$ npx next-pwa-auto init

🚀 next-pwa-auto init
─────────────────────────────────────────────
  Project: my-app
  Router:  App Router

  ✓ Set up next-pwa-auto in this project?
  ✓ next-pwa-auto found in dependencies
  ✓ Updated next config to use withPWAAuto
  ✓ Select icon file from public/ (or choose placeholder):
  ✓ Added <PWAHead /> to layout
  ✓ Run next build now to generate PWA assets?
  ✓ Run next-pwa-auto doctor now?
─────────────────────────────────────────────
  ✨ Setup complete!

  Next steps:
  1. Run next build to generate PWA assets
  2. Run npx next-pwa-auto doctor to verify setup
  3. Deploy with HTTPS for full PWA support
```

What `init` does:

1. Detects your router type (App / Pages)
2. Installs `next-pwa-auto` if missing
3. Injects `withPWAAuto()` into your `next.config.{js,ts,mts}` (adds `icon` when selected)
4. Adds `<PWAHead />` to your root layout
5. Selects an icon from `public/` or uses a placeholder
6. Optionally runs `next build`
7. Optionally runs `next-pwa-auto doctor`

Run all steps in auto mode with:

```bash
npx next-pwa-auto init --skip
```

Re-run setup in auto mode even if `next-pwa-auto` is already present:

```bash
npx next-pwa-auto init --skip --force
```

---

## Generated Files

After `next build`, these files are created:

```
public/
├── manifest.webmanifest         # Web App Manifest (auto-generated)
└── _pwa/
    ├── icons/
    │   ├── icon-72x72.png       # Standard icons
    │   ├── icon-96x96.png
    │   ├── icon-128x128.png
    │   ├── icon-144x144.png
    │   ├── icon-152x152.png
    │   ├── icon-192x192.png
    │   ├── icon-384x384.png
    │   ├── icon-512x512.png
    │   ├── icon-192x192-maskable.png  # Maskable icons (Android)
    │   └── icon-512x512-maskable.png
    ├── offline.html             # Offline fallback page
    └── sw-register.js           # Service worker registration script
```

> **Tip:** Add `_pwa/` to your `.gitignore` — these files are regenerated on every build.

---

## Overrides & Customization

### Custom Manifest

Place a `manifest.json` or `manifest.webmanifest` in `public/`. Your values are merged on top of the auto-generated manifest.

```json
{
  "name": "My Custom App Name",
  "theme_color": "#6200ee",
  "shortcuts": [
    {
      "name": "Dashboard",
      "url": "/dashboard",
      "icons": [{ "src": "/icons/dashboard.png", "sizes": "96x96" }]
    }
  ]
}
```

### Custom Offline Page

Place a `_offline.html` in your `public/` directory to use your own offline page instead of the auto-generated one.

### Custom Source Icon

By default, next-pwa-auto searches for icons in this order:

1. `public/icon.svg`
2. `public/icon.png`
3. `public/logo.svg`
4. `public/logo.png`
5. `public/favicon.svg`
6. `public/favicon.png`
7. `public/app-icon.svg`
8. `public/app-icon.png`

If none are found, a **placeholder icon is auto-generated** with your app's initials on a themed background.

To use a specific file:

```js
withPWAAuto({
  icon: './assets/my-logo.png',
});
```

### Placeholder Icons

When no source icon exists, next-pwa-auto generates a placeholder:

- **Background**: Uses `theme_color` from your manifest config (default: `#1a1a2e`)
- **Text**: First 1-2 initials of your app name (e.g., "My App" → "MA")
- **All sizes**: Full set of 10 icons generated, including maskable variants

This means your PWA always has valid icons, even with zero setup.

---

## Comparison with Alternatives

| Feature                      | next-pwa-auto | [next-pwa](https://github.com/shadowwalker/next-pwa) | [@ducanh2912/next-pwa](https://github.com/DuCanhGH/next-pwa) | [Serwist](https://serwist.pages.dev/) |
| ---------------------------- | :-----------: | :--------------------------------------------------: | :----------------------------------------------------------: | :-----------------------------------: |
| **Near-zero setup**          |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **Auto manifest generation** |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **Auto icon generation**     |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **Placeholder icons**        |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **Built-in offline page**    |      ✅       |                          ❌                          |                              ⚠️                              |                  ❌                   |
| **Safe caching defaults**    |      ✅       |                          ⚠️                          |                              ⚠️                              |                  ✅                   |
| **Auth URL exclusions**      |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **Dev mode auto-unregister** |      ✅       |                          ❌                          |                              ✅                              |                  ✅                   |
| **Update UX hook**           |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **PWAHead component**        |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **CLI doctor**               |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **CLI init**                 |      ✅       |                          ❌                          |                              ❌                              |                  ❌                   |
| **App Router support**       |      ✅       |                          ⚠️                          |                              ✅                              |                  ✅                   |
| **Pages Router support**     |      ✅       |                          ✅                          |                              ✅                              |                  ✅                   |
| **Next.js 14+**              |      ✅       |                  ❌ (unmaintained)                   |                              ✅                              |                  ✅                   |
| **TypeScript**               |      ✅       |                          ⚠️                          |                              ✅                              |                  ✅                   |

### Why choose next-pwa-auto?

- **`next-pwa`** — The original, but **unmaintained since 2022**. Doesn't support App Router. No auto-generation features.
- **`@ducanh2912/next-pwa`** — Active fork of next-pwa. Good quality, but still requires manual manifest, icons, and offline page setup.
- **`Serwist`** — Modern and well-maintained, but focused on service worker configuration. You still need to handle manifest, icons, and offline pages yourself.
- **`next-pwa-auto`** — The only option that does **everything** automatically. Install it, add one component, and you have a complete PWA with manifest, icons, service worker, offline support, update UX, and security-safe caching — with near-zero setup.

---

## FAQ

### Does it work with `output: "standalone"`?

Yes. The generated PWA assets are placed in `public/`, which is included in standalone builds.

### Does it work on Vercel?

Yes. The service worker and manifest are static files served from `public/`. Vercel serves these with no extra configuration needed.

### What about HTTPS?

Service workers require HTTPS in production (localhost is exempt for development). Run `npx next-pwa-auto doctor` to check your setup.

### Can I use it with existing SW code?

Yes. Use the `workbox` config to pass additional options to `GenerateSW`, or use `additionalManifestEntries` to precache custom assets.

### Will it cache my API responses?

**No.** API routes (`/api/*`) default to `NetworkOnly` — they are **never cached**. Auth-related URLs (`/auth/*`, `/login`, `/oauth/*`, etc.) are also excluded from caching entirely. This is a deliberate security decision.

### How do I force-enable SW in development?

```bash
NEXT_PWA=1 next dev
```

### How do I update users to a new version?

Use the `usePWAUpdate` hook to show an update banner:

```tsx
import usePWAUpdate from 'next-pwa-auto/hooks';

function App() {
  const { updateAvailable, update } = usePWAUpdate();
  // Show a banner when updateAvailable is true
  // Call update() to activate the new version
}
```

### Can I disable it for certain environments?

```js
withPWAAuto({
  disable: process.env.NODE_ENV === 'test',
  disableInDev: true, // default
});
```

### What icon format should I use?

A **512×512 PNG** is recommended. SVG also works. The plugin generates all required sizes from your single source image, including maskable variants with proper safe-zone padding.

---

## Requirements

- **Next.js** 14+ (App Router or Pages Router)
- **React** 18+
- **Node.js** 18+
- **sharp** (installed automatically as a dependency)

---

## Contributing

Contributions are welcome! This project uses:

- **TypeScript** for type safety
- **tsup** for bundling
- **Vitest** for testing (126 tests)
- **sharp** for image processing
- **Workbox** for service worker generation

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Build
bun run build

# Watch mode
bun run dev
```

---

## License

[MIT](LICENSE) © [Toufiq Hasan Kiron](https://github.com/kiron0)
