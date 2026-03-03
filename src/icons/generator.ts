import * as path from 'path';
import sharp from 'sharp';
import { formatAppName, getPublicDir, getPwaOutputDir } from '../config';
import { ManifestIcon, ResolvedConfig } from '../types';
import { ensureDir, findSourceIcon } from './utils';

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];
const MASKABLE_PADDING_RATIO = 0.1;

export interface IconGenerationResult {
  icons: ManifestIcon[];
  sourceIcon: string;
}

export async function generateIcons(config: ResolvedConfig): Promise<IconGenerationResult> {
  const publicDir = getPublicDir(config.projectRoot);
  const pwaDir = getPwaOutputDir(config);
  const iconsDir = path.join(pwaDir, 'icons');
  const forceRegenerateIcons = process.env.NEXT_PWA_AUTO_FORCE_ICON_REGEN === '1';
  let sourceIcon: string | null = null;
  if (config.icon) {
    const iconPath = path.isAbsolute(config.icon)
      ? config.icon
      : path.join(config.projectRoot, config.icon);
    if (require('fs').existsSync(iconPath)) {
      sourceIcon = iconPath;
    }
  }
  if (!sourceIcon && !forceRegenerateIcons) {
    sourceIcon = findSourceIcon(publicDir);
  }
  ensureDir(iconsDir);
  let sourceBuffer: Buffer;
  let sourceName: string;
  if (sourceIcon) {
    sourceBuffer = await sharp(sourceIcon).png().toBuffer();
    sourceName = path.basename(sourceIcon);
  } else {
    const appName = formatAppName(config.packageInfo.name);
    const themeColor = (config.manifest as any)?.theme_color || '#1a1a2e';
    sourceBuffer = await generatePlaceholderIcon(appName, themeColor, 512);
    sourceName = 'placeholder (auto-generated)';
    console.log(
      `[next-pwa-auto] ℹ No source icon found — generating placeholder with initials "${getInitials(appName)}"`
    );
  }
  const icons: ManifestIcon[] = [];
  for (const size of ICON_SIZES) {
    const filename = `icon-${size}x${size}.png`;
    const outputPath = path.join(iconsDir, filename);
    const relativePath = `/${config.pwaDir}/icons/${filename}`;
    await sharp(sourceBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(outputPath);
    icons.push({
      src: relativePath,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    });
  }

  const existingFavicon = getExistingFaviconPath(config.projectRoot);
  if (!existingFavicon) {
    const faviconPath = path.join(publicDir, 'favicon.ico');
    await generateFavicon(sourceBuffer, faviconPath);
  } else {
    console.log(
      `[next-pwa-auto] ℹ Skipping favicon generation because existing favicon exists: ${path.relative(config.projectRoot, existingFavicon)}`
    );
  }

  for (const size of MASKABLE_SIZES) {
    const filename = `icon-${size}x${size}-maskable.png`;
    const outputPath = path.join(iconsDir, filename);
    const relativePath = `/${config.pwaDir}/icons/${filename}`;
    const padding = Math.round(size * MASKABLE_PADDING_RATIO);
    const innerSize = size - padding * 2;
    const innerImage = await sharp(sourceBuffer)
      .resize(innerSize, innerSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: innerImage, gravity: 'centre' }])
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(outputPath);
    icons.push({
      src: relativePath,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'maskable',
    });
  }
  console.log(
    `[next-pwa-auto] ${String.fromCodePoint(0x2705)} Generated ${icons.length} icons from ${sourceName}`
  );
  return { icons, sourceIcon: sourceIcon || 'placeholder' };
}

async function generateFavicon(sourceBuffer: Buffer, outputPath: string): Promise<void> {
  try {
    await sharp(sourceBuffer)
      .resize(48, 48, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(outputPath);
  } catch {
    await sharp(sourceBuffer)
      .resize(48, 48, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outputPath);
  }
}

function getExistingFaviconPath(projectRoot: string): string | null {
  const candidates = [
    path.join(projectRoot, 'public', 'favicon.ico'),
    path.join(projectRoot, 'app', 'favicon.ico'),
    path.join(projectRoot, 'src', 'app', 'favicon.ico'),
  ];
  for (const candidate of candidates) {
    if (require('fs').existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

async function generatePlaceholderIcon(
  appName: string,
  bgColor: string,
  size: number
): Promise<Buffer> {
  const initials = getInitials(appName);
  const fontSize = Math.round(size * 0.38);
  const color = bgColor.startsWith('#') ? bgColor : '#1a1a2e';
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="${color}"/>
      <text
        x="50%"
        y="50%"
        dominant-baseline="central"
        text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-weight="700"
        font-size="${fontSize}"
        fill="white"
        letter-spacing="${Math.round(fontSize * 0.05)}"
      >${initials}</text>
    </svg>
  `.trim();
  return sharp(Buffer.from(svg)).png().toBuffer();
}
