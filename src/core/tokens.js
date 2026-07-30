/* Design tokens shared by the app core and the lazy-loaded chart module. */
import { Beef, Wheat, Droplet } from 'lucide-react';

export const T = {
  bg: '#0c0c0e', panel: '#141418', panel2: '#1b1b21',
  border: '#27272f', borderHi: '#3a3a45',
  text: '#f3f3f1', muted: '#8c8c96', faint: '#5b5b65',
  lime: '#cbff3a', limeDim: 'rgba(203,255,58,0.13)', orange: '#ff7a45',
};
export const MACROS = {
  protein: { label: 'Protein', short: 'Prot', color: '#ff5d8f', Icon: Beef, cal: 4 },
  carbs:   { label: 'Carbs',   short: 'Carb', color: '#46b8ff', Icon: Wheat, cal: 4 },
  fat:     { label: 'Fat',     short: 'Fat',  color: '#ffc24b', Icon: Droplet, cal: 9 },
};
export const MK = Object.keys(MACROS);
export const display = { fontFamily: "'Anton', system-ui, sans-serif", letterSpacing: '0.01em' };
export const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" };
