/** Ajustes de cámara con los mismos parámetros que el menú de Rocket League. */
export interface CameraSettings {
  /** Campo de visión horizontal en grados */
  fov: number;
  /** Distancia detrás del coche (m) */
  distance: number;
  /** Altura sobre el coche (m) */
  height: number;
  /** Inclinación en grados (negativo = mira hacia abajo) */
  angle: number;
  /** 0 = cámara elástica, 1 = rígida */
  stiffness: number;
  /** Rapidez del giro manual con el stick derecho */
  swivelSpeed: number;
  /** Rapidez de transición entre Ball Cam y cámara de coche */
  transitionSpeed: number;
  /** Ball Cam activa al empezar */
  ballCamDefault: boolean;
  /** Vibración de cámara en explosiones */
  shake: boolean;
}

export interface SliderSpec {
  key: keyof Omit<CameraSettings, 'ballCamDefault' | 'shake'>;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

export const DEFAULT_CAMERA: CameraSettings = {
  fov: 110,
  distance: 2.7,
  height: 1.0,
  angle: -4,
  stiffness: 0.45,
  swivelSpeed: 5,
  transitionSpeed: 1.2,
  ballCamDefault: true,
  shake: true,
};

/** Rangos equivalentes a los del juego original (uu convertidas a metros). */
export const CAMERA_SLIDERS: readonly SliderSpec[] = [
  { key: 'fov', label: 'Campo de visión (FOV)', min: 60, max: 110, step: 1, format: (v) => `${v.toFixed(0)}°` },
  { key: 'distance', label: 'Distancia', min: 1.0, max: 4.0, step: 0.1, format: (v) => `${Math.round(v * 100)}` },
  { key: 'height', label: 'Altura', min: 0.4, max: 2.0, step: 0.1, format: (v) => `${Math.round(v * 100)}` },
  { key: 'angle', label: 'Ángulo', min: -15, max: 0, step: 1, format: (v) => `${v.toFixed(0)}°` },
  { key: 'stiffness', label: 'Rigidez (Stiffness)', min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2) },
  { key: 'swivelSpeed', label: 'Velocidad de giro (Swivel)', min: 1, max: 10, step: 0.1, format: (v) => v.toFixed(1) },
  { key: 'transitionSpeed', label: 'Velocidad de transición', min: 1, max: 2, step: 0.1, format: (v) => v.toFixed(1) },
];
