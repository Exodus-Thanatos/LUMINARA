// The streetlight list (registry). The map owns editing; every other page only READS it through here,
// so the Dashboard, the Map and the Streetlights page count the same streetlights.
import { SAMPLE_LAMPS } from './streetlightMapData.js';

export const STORAGE_LAMPS = 'luminara.map.lamps.v1';

export const loadLamps = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_LAMPS));
    return Array.isArray(parsed) ? parsed : SAMPLE_LAMPS;
  } catch {
    return SAMPLE_LAMPS;
  }
};
