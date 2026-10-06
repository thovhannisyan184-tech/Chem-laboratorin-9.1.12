export type SafetyItemKey = 'goggles' | 'gloves' | 'coat';

export interface SafetyState {
  goggles: boolean;
  gloves: boolean;
  coat: boolean;
}

export type LabStep =
  | 'safety'            // Must activate all 3 safety items first
  | 'step1_scoop'       // Drag spatula to Na2SO3 jar to scoop powder
  | 'step1_weigh'       // Drag spatula with powder to weighing paper on scale (shows 0.1 g)
  | 'step1_transfer'    // Drag powder (via spatula or weighing paper) to center Well #1
  | 'step2_draw_acid'   // Drag pipette to 10% H2SO4 bottle to draw 0.1 ml acid
  | 'step2_add_acid'    // Drag filled pipette to center Well #1 to drop acid onto Na2SO3
  | 'step3_cover'       // Drag transparent plastic cover onto the 3x3 multi-well plate
  | 'diffusing'         // Automatic reaction + SO2 gas diffusion + timer 00:00 -> 05:00
  | 'completed';        // t = 300s reached, knowledge check unlocked

export interface WellData {
  id: number;           // 1 to 9 (#1 is center, #2,#4,#6,#8 are near, #3,#5,#7,#9 are far)
  row: number;          // 0, 1, 2
  col: number;          // 0, 1, 2
  zone: 'center' | 'near' | 'far';
  distanceFactor: number; // 0 for center, 1.0 for orthogonal, 1.414 for diagonal
  label: string;
}

export interface ObservationRecord {
  id: string;
  timeSeconds: number;
  formattedTime: string;
  isAuto: boolean;
  well1State: {
    colorHex: string;
    label: string;
    subtext: string;
  };
  well2State: {
    colorHex: string;
    label: string;
    pH: number;
  };
  well3State: {
    colorHex: string;
    label: string;
    pH: number;
  };
}

export type CameraPreset = 'perspective' | 'top' | 'closeup';
