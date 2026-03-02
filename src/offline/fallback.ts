import * as fs from 'fs';
import * as path from 'path';
import { getPwaOutputDir } from '../config';
import { ensureDir } from '../icons/utils';
import { ResolvedConfig } from '../types';

export function generateOfflinePage(config: ResolvedConfig): string | null {
  if (!config.offline) return null;
  const publicDir = path.join(config.projectRoot, 'public');
  const pwaDir = getPwaOutputDir(config);
  const userOfflinePage = path.join(publicDir, '_offline.html');
  if (fs.existsSync(userOfflinePage)) {
    console.log('[next-pwa-auto] ℹ Using user-defined offline page: public/_offline.html');
    ensureDir(pwaDir);
    const dest = path.join(pwaDir, 'offline.html');
    fs.copyFileSync(userOfflinePage, dest);
    return dest;
  }
  ensureDir(pwaDir);
  const outputPath = path.join(pwaDir, 'offline.html');
  const appName = config.packageInfo.name || 'App';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline — ${appName}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

    :root {
      --bg: #fafafa;
      --fg: #18181b;
      --muted: #71717a;
      --accent: #2563eb;
      --card-bg: #ffffff;
      --border: #e4e4e7;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b;
        --fg: #fafafa;
        --muted: #a1a1aa;
        --accent: #3b82f6;
        --card-bg: #18181b;
        --border: #27272a;
      }
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--fg);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .container {
      text-align: center;
      max-width: 420px;
      animation: fadeIn 0.5s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      border-radius: 50%;
      background: var(--card-bg);
      border: 2px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon svg {
      width: 36px;
      height: 36px;
      stroke: var(--muted);
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
    }

    p {
      color: var(--muted);
      font-size: 1rem;
      line-height: 1.6;
      margin-bottom: 2rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      font-size: 0.9rem;
      font-weight: 500;
      color: #fff;
      background: var(--accent);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: opacity 0.2s;
      text-decoration: none;
    }

    .btn:hover { opacity: 0.9; }
    .btn:active { transform: scale(0.98); }

    .btn svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
    </div>
    <h1>You're offline</h1>
    <p>It looks like you've lost your internet connection. Check your network and try again.</p>
    <button class="btn" onclick="window.location.reload()">
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      Try again
    </button>
  </div>
</body>
</html>`;
  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log('[next-pwa-auto] ✅ Generated offline fallback page');
  return outputPath;
}
