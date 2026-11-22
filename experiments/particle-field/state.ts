// The settings everything reads and changes, loaded from this device (older saves upgraded).
import { DEFAULTS, upgradeShape, type Settings } from './settings.ts';
import { migrateLegacy } from './links.ts';

export const STORAGE_KEY = 'particle-field:settings';

export const settings: Settings = { ...DEFAULTS, ...upgradeShape(load()) };

// Sound quality was a switch plus an amount; now the amount alone (0 = off),
// and the Mix polish reverb became Reverb type, for any mix.
export function qualityOneSlider(o: Record<string, unknown>) {
  if (!o || typeof o !== 'object') return o;
  for (const [sw, amt] of [['sndPolish', 'sndPolishAmt'], ['sndUnison', 'sndUnisonAmt'], ['sndWave', 'sndWaveAmt'], ['sndHuman', 'sndHumanAmt']]) {
    if (typeof o[sw] !== 'boolean') continue;
    if (!o[sw]) o[amt] = 0;
    delete o[sw];
  }
  if (typeof o.sndPolishVerb === 'string') {
    if (Number(o.sndPolishAmt) > 0 && !o.sndVerb) o.sndVerb = o.sndPolishVerb;
    delete o.sndPolishVerb;
  }
  return o;
}

export function load(): Partial<Settings> {
  try {
    return migrateLegacy(qualityOneSlider(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')));
  } catch {
    return {};
  }
}
