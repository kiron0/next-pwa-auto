import { formatAppName } from '../config';
import { ManifestIcon, ResolvedConfig, WebAppManifest } from '../types';

export function generateManifest(config: ResolvedConfig, icons: ManifestIcon[]): WebAppManifest {
  const appName = formatAppName(config.packageInfo.name);
  const baseManifest: WebAppManifest = {
    name: appName,
    short_name: appName.length > 12 ? appName.substring(0, 12) : appName,
    description: config.packageInfo.description || `${appName} — Progressive Web App`,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    orientation: 'any',
    icons,
    scope: config.scope,
  };
  const merged = deepMerge(baseManifest, config.manifest) as WebAppManifest;
  return merged;
}

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result;
}
