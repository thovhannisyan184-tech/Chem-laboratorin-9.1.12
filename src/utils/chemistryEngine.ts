import { WellData, ObservationRecord } from '../types/lab';

/**
 * 3x3 Multi-well Plate Layout matching the prompt's numbering:
 * - #1 is the center well (row 1, col 1) -> Initially empty, receives Na2SO3 + H2SO4
 * - #2, #4, #6, #8 are the closest orthogonal neighbors (distance = 1.0)
 * - #3, #5, #7, #9 are the distant diagonal corner wells (distance = 1.414)
 */
export const PLATE_WELLS: WellData[] = [
  { id: 5, row: 0, col: 0, zone: 'far',    distanceFactor: 1.414, label: '#5 (Հեռու)' },
  { id: 2, row: 0, col: 1, zone: 'near',   distanceFactor: 1.0,   label: '#2 (Մոտ)' },
  { id: 3, row: 0, col: 2, zone: 'far',    distanceFactor: 1.414, label: '#3 (Հեռու)' },
  { id: 4, row: 1, col: 0, zone: 'near',   distanceFactor: 1.0,   label: '#4 (Մոտ)' },
  { id: 1, row: 1, col: 1, zone: 'center', distanceFactor: 0.0,   label: '#1 (Կենտրոն)' },
  { id: 6, row: 1, col: 2, zone: 'near',   distanceFactor: 1.0,   label: '#6 (Մոտ)' },
  { id: 7, row: 2, col: 0, zone: 'far',    distanceFactor: 1.414, label: '#7 (Հեռու)' },
  { id: 8, row: 2, col: 1, zone: 'near',   distanceFactor: 1.0,   label: '#8 (Մոտ)' },
  { id: 9, row: 2, col: 2, zone: 'far',    distanceFactor: 1.414, label: '#9 (Հեռու)' },
];

function lerp(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return a + (b - a) * clamped;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

export function interpolateHex(hex1: string, hex2: string, factor: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(lerp(r1, r2, factor), lerp(g1, g2, factor), lerp(b1, b2, factor));
}

/**
 * Computes the color, pH, and Armenian description for the closest wells (#2, #4, #6, #8)
 * as a function of time t (0 to 300 seconds):
 * - t = 0s:   #FFA500 (Նարնջագույն / դեղնավուն, pH 6.8)
 * - t = 30s:  #FF4500 (Սկսում է կարմրել / նարնջակարմիր, pH 4.2)
 * - t = 120s: #FF0000 (Ամբողջությամբ կարմիր, pH 3.3)
 * - t = 300s: #C80018 (Մուգ կարմիր, pH 2.8)
 */
export function getNearWellState(timeSeconds: number): {
  colorHex: string;
  label: string;
  pH: number;
  so2Concentration: number;
} {
  const t = Math.max(0, Math.min(300, timeSeconds));

  if (t <= 8) {
    return {
      colorHex: '#FFA500',
      label: 'Նարնջագույն (#FFA500)',
      pH: Number(lerp(6.8, 6.4, t / 8).toFixed(2)),
      so2Concentration: lerp(0, 0.08, t / 8),
    };
  }

  if (t <= 30) {
    const f = (t - 8) / (30 - 8);
    const colorHex = interpolateHex('#FFA500', '#FF4500', f);
    return {
      colorHex,
      label: t < 20 ? 'Մուգ նարնջագույն' : 'Կարմրավուն-նարնջագույն (#FF4500)',
      pH: Number(lerp(6.4, 4.2, f).toFixed(2)),
      so2Concentration: lerp(0.08, 0.35, f),
    };
  }

  if (t <= 120) {
    const f = (t - 30) / (120 - 30);
    const colorHex = interpolateHex('#FF4500', '#FF0000', f);
    return {
      colorHex,
      label: f < 0.7 ? 'Անցում դեպի կարմիր' : 'Ամբողջությամբ կարմիր (#FF0000)',
      pH: Number(lerp(4.2, 3.3, f).toFixed(2)),
      so2Concentration: lerp(0.35, 0.78, f),
    };
  }

  const f = (t - 120) / (300 - 120);
  const colorHex = interpolateHex('#FF0000', '#BE0019', f);
  return {
    colorHex,
    label: f < 0.5 ? 'Հագեցած կարմիր' : 'Մուգ կարմիր (բարձր թթվայնություն)',
    pH: Number(lerp(3.3, 2.8, f).toFixed(2)),
    so2Concentration: lerp(0.78, 1.0, f),
  };
}

/**
 * Computes the color, pH, and Armenian description for the distant corner wells (#3, #5, #7, #9)
 * as a function of time t (0 to 300 seconds):
 * - t = 0..35s:  #FFA500 (Նարնջագույն, SO2-ը դեռ չի հասել բավարար քանակով)
 * - t = 35..120s: transitions from #FFA500 to pinkish-rose #FF5E7E (Վարդագույն, pH 4.5)
 * - t = 120..300s: transitions from #FF5E7E to light red #FF3333 (Բաց կարմիր, pH 3.5)
 */
export function getFarWellState(timeSeconds: number): {
  colorHex: string;
  label: string;
  pH: number;
  so2Concentration: number;
} {
  const t = Math.max(0, Math.min(300, timeSeconds));

  if (t <= 35) {
    return {
      colorHex: '#FFA500',
      label: 'Նարնջագույն (#FFA500)',
      pH: Number(lerp(6.8, 6.6, t / 35).toFixed(2)),
      so2Concentration: lerp(0, 0.04, t / 35),
    };
  }

  if (t <= 120) {
    const f = (t - 35) / (120 - 35);
    const colorHex = interpolateHex('#FFA500', '#FF5C77', f);
    return {
      colorHex,
      label: f < 0.45 ? 'Բաց նարնջագույն-վարդագույն' : 'Վարդագույն (սկսում է կարմրել)',
      pH: Number(lerp(6.6, 4.5, f).toFixed(2)),
      so2Concentration: lerp(0.04, 0.42, f),
    };
  }

  const f = (t - 120) / (300 - 120);
  const colorHex = interpolateHex('#FF5C77', '#FF2E2E', f);
  return {
    colorHex,
    label: f < 0.5 ? 'Վարդագույն-կարմիր' : 'Բաց կարմիր (ցածր գրադիենտ)',
    pH: Number(lerp(4.5, 3.5, f).toFixed(2)),
    so2Concentration: lerp(0.42, 0.72, f),
  };
}

/**
 * Computes the state of center Well #1 based on step and reaction time
 */
export function getCenterWellState(
  hasPowder: boolean,
  hasAcid: boolean,
  timeSeconds: number
): {
  colorHex: string;
  label: string;
  subtext: string;
} {
  if (!hasPowder && !hasAcid) {
    return {
      colorHex: '#334155',
      label: 'Դատարկ փոսիկ',
      subtext: 'Սպասում է ռեագենտներին',
    };
  }
  if (hasPowder && !hasAcid) {
    return {
      colorHex: '#F8FAFC',
      label: 'Սպիտակ փոշի (Na₂SO₃)',
      subtext: '0,1 գ նատրիումի սուլֆիտ',
    };
  }
  if (timeSeconds === 0) {
    return {
      colorHex: '#E0F2FE',
      label: 'Անգույն + SO₂↑ պղպջակներ',
      subtext: 'Ռեակցիայի սկիզբ (t = 0 վրկ)',
    };
  }
  if (timeSeconds < 120) {
    return {
      colorHex: '#BAE6FD',
      label: 'Անգույն հեղուկ (բուռն SO₂↑)',
      subtext: 'Ակտիվ գազանջատում',
    };
  }
  if (timeSeconds < 300) {
    return {
      colorHex: '#E2E8F0',
      label: 'Անգույն լուծույթ (Na₂SO₄)',
      subtext: 'Դանդաղող պղպջակներ',
    };
  }
  return {
    colorHex: '#F1F5F9',
    label: 'Անգույն լուծույթ (ավարտված)',
    subtext: 'Na₂SO₄ + H₂O, SO₂-ը անջատվել է',
  };
}

export function formatTimer(seconds: number): string {
  const s = Math.floor(Math.max(0, Math.min(300, seconds)));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

export function createObservationRecord(
  timeSeconds: number,
  hasPowder: boolean,
  hasAcid: boolean,
  isAuto: boolean
): ObservationRecord {
  const near = getNearWellState(timeSeconds);
  const far = getFarWellState(timeSeconds);
  const center = getCenterWellState(hasPowder, hasAcid, timeSeconds);

  return {
    id: `${Math.round(timeSeconds)}-${isAuto ? 'auto' : 'manual'}-${Math.random().toString(36).slice(2, 6)}`,
    timeSeconds: Math.round(timeSeconds),
    formattedTime: formatTimer(timeSeconds),
    isAuto,
    well1State: center,
    well2State: {
      colorHex: near.colorHex,
      label: near.label,
      pH: near.pH,
    },
    well3State: {
      colorHex: far.colorHex,
      label: far.label,
      pH: far.pH,
    },
  };
}
