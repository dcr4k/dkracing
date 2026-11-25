export type Drivetrain = 'FF' | 'FR' | 'MR' | '4WD';

export type CarBodyStyle =
  | 'hatch'
  | 'coupe'
  | 'midship'
  | 'sedan_gtr'
  | 'rotary_coupe'
  | 'rally_sedan'
  | 'gt_coupe';

export type CameraMode = 'chase' | 'bumper' | 'cinematic';

export type TransmissionMode = 'auto' | 'manual';

export type RaceMode = 'race' | 'time_trial' | 'drift' | 'license';

export type LicenseTestId = 'B-1' | 'B-2' | 'B-3';

export type MedalType = 'none' | 'bronze' | 'silver' | 'gold';

export type PaintFinish = 'metallic' | 'matte' | 'chrome';

export type RimStyle = 'stock_5spoke' | 'mesh_gt' | 'deep_dish' | 'aero_turbo';

export type TimeOfDay = 'day' | 'sunset' | 'night';

export type TrackId = 'grand_prix' | 'serra_touge' | 'night_expressway';

export type SteeringMode = 'buttons' | 'wheel' | 'gyro';

export type AppScreen =
  | 'title'
  | 'gt_home'
  | 'garage'
  | 'dealership'
  | 'tuning'
  | 'license'
  | 'race_setup'
  | 'settings'
  | 'playing'
  | 'paused'
  | 'result';

export interface CarVisualConfig {
  paintHex?: string;
  paintFinish: PaintFinish;
  rimStyle: RimStyle;
  gtWing: boolean;
  rideHeightDropM: number; // 0..0.09m visual lowering from suspension tuning
  glbUrl?: string;
  wheelGlbUrl?: string;
}

export interface CarSpec {
  id: string;
  name: string;
  manufacturer: string;
  year: number;
  drivetrain: Drivetrain;
  bodyStyle: CarBodyStyle;
  price: number;
  colorHex: string;
  accentHex: string;
  rimHex: string;
  baseHp: number;
  baseTorqueNm: number;
  baseMassKg: number;
  redlineRpm: number;
  idleRpm: number;
  maxSteerDeg: number;
  wheelbaseM: number;
  cgHeightM: number;
  frontWeightRatio: number; // e.g., 0.62 for FF, 0.52 for FR, 0.43 for MR, 0.56 for 4WD
  dragCoeff: number;
  downforceCoeff: number;
  gearRatios: number[]; // [1st, 2nd, 3rd, 4th, 5th, 6th]
  finalDrive: number;
  reverseRatio: number;
  description: string;
  handlingNote: string;
  glbUrl?: string;
  targetLengthM?: number;
  isElectric?: boolean;
  maxSpeedKmh?: number;
  evZeroToFiftySec?: number;
  evZeroToHundredSec?: number;
}

export interface PaintItem {
  id: string;
  name: string;
  hex: string;
  price: number;
  finish: string;
}

export interface RimOption {
  id: RimStyle;
  name: string;
  price: number;
  summary: string;
}

export interface TrackMeta {
  id: TrackId;
  name: string;
  subtitle: string;
  lengthKm: string;
  difficulty: string;
  recommendedTime: TimeOfDay;
  environmentType: 'circuit' | 'touge' | 'expressway';
}

export interface TuningState {
  engineStage: 0 | 1 | 2 | 3;
  weightStage: 0 | 1 | 2 | 3;
  tireStage: 0 | 1 | 2 | 3; // 0: Rua, 1: Esportivo, 2: Semi-Slick, 3: Drift
  chassisStage: 0 | 1 | 2 | 3; // Suspensão & Freios: 0..3 (também rebaixa a carroceria)
}

export interface EffectiveCarSpecs {
  hp: number;
  torqueNm: number;
  massKg: number;
  powerToWeight: number; // kg/HP
  tireGripMu: number;
  tireLongGripMu: number;
  rearLateralBias: number; // < 1.0 on Drift tires to promote controllable oversteer
  isDriftTire: boolean;
  hasTurbo: boolean;
  isElectric: boolean;
  maxSpeedKmh: number;
  evZeroToFiftySec: number;
  evZeroToHundredSec: number;
  rideHeightDropM: number;
  brakeForceN: number;
  rollStiffness: number;
  pitchStiffness: number;
  frontWeightRatio: number;
  drivetrain: Drivetrain;
  redlineRpm: number;
  idleRpm: number;
  maxSteerRad: number;
  wheelbaseM: number;
  cgHeightM: number;
  dragCoeff: number;
  downforceCoeff: number;
  gearRatios: number[];
  finalDrive: number;
  reverseRatio: number;
}

export interface TuningPartOption {
  stage: number;
  name: string;
  price: number;
  summary: string;
}

export interface LicenseTestDef {
  id: LicenseTestId;
  code: string;
  title: string;
  subtitle: string;
  description: string;
  carId: string;
  goldTime: number;
  silverTime: number;
  bronzeTime: number;
  rewards: {
    bronze: number;
    silver: number;
    gold: number;
  };
  objectiveType: 'stop_zone' | 'sector_sprint';
  targetDistanceM: number;
  stopZoneStartM?: number;
  stopZoneEndM?: number;
}

export interface LicenseRecord {
  bestTime: number | null;
  medal: MedalType;
  claimedGold: boolean;
  claimedSilver: boolean;
  claimedBronze: boolean;
}

export interface AssistSettings {
  tcs: boolean;
  abs: boolean;
  transmission: TransmissionMode;
}

export interface SaveState {
  credits: number;
  ownedCarIds: string[];
  selectedCarId: string;
  tuningByCar: Record<string, TuningState>;
  ownedTiresByCar: Record<string, number[]>;
  ownedPaintIds: string[];
  paintByCar: Record<string, string>; // carId -> paintId
  paintFinishByCar: Record<string, PaintFinish>;
  ownedRimStyles: RimStyle[];
  rimStyleByCar: Record<string, RimStyle>;
  ownedGtWingCars: string[];
  gtWingByCar: Record<string, boolean>;
  licenseRecords: Record<LicenseTestId, LicenseRecord>;
  bestCircuitLapSec: number | null;
  racesWon: number;
  assists: AssistSettings;
  defaultCamera: CameraMode;
  steeringMode: SteeringMode;
  selectedTrackId: TrackId;
  selectedTimeOfDay: TimeOfDay;
  muted: boolean;
}

export interface ControlInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) to +1 (left) in 3D right-handed coordinates
  handbrake: boolean;
  shiftUpJustPressed: boolean;
  shiftDownJustPressed: boolean;
}

export interface VehiclePhysicsState {
  x: number;
  y: number;
  z: number;
  heading: number; // radians, 0 = +Z, +PI/2 = +X
  vx: number; // world X velocity m/s
  vz: number; // world Z velocity m/s
  localVx: number; // lateral velocity m/s (+right or +left)
  localVz: number; // forward velocity m/s
  yawRate: number; // rad/s
  steerAngle: number; // current front wheel angle rad
  rpm: number;
  gear: number; // -1 = R, 0 = N, 1..6 = forward gears
  shiftCooldown: number;
  wheelSpinRad: number;
  speedKmh: number;
  longG: number;
  latG: number;
  frontLoadRatio: number; // dynamic front weight ratio 0.25..0.80
  rearLoadRatio: number;
  pitchRad: number; // nose dive / squat
  rollRad: number; // body roll
  frontSlip: number; // normalized 0..1+
  rearSlip: number; // normalized 0..1+
  tireScreech: number; // 0..1
  isBraking: boolean;
  absActive: boolean;
  tcsActive: boolean;
  onTrack: boolean;
  onCurb: boolean;
  surfaceMuScale: number;
}

export interface TrackSample {
  s: number; // cumulative arc distance in meters
  x: number;
  y: number;
  z: number;
  tx: number; // unit tangent X
  tz: number; // unit tangent Z
  nx: number; // unit right normal X
  nz: number; // unit right normal Z
  curvature: number; // rad/m
  width: number; // road half-width * 2
  hasLeftCurb: boolean;
  hasRightCurb: boolean;
}

export interface TrackProjection {
  s: number;
  lateralOffset: number; // signed distance from centerline (+right, -left)
  sampleIndex: number;
  heightY: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  halfWidth: number;
  onTrack: boolean;
  onCurb: boolean;
}

export interface MinimapDot {
  x: number;
  z: number;
  isPlayer: boolean;
  color: string;
}

export interface HudTelemetry {
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number;
  throttle: number;
  brake: number;
  longG: number;
  latG: number;
  frontSlip: number;
  rearSlip: number;
  absActive: boolean;
  tcsActive: boolean;
  shiftLight: boolean;
  lap: number;
  totalLaps: number;
  position: number;
  totalCars: number;
  currentLapTime: number;
  bestLapTime: number | null;
  totalTime: number;
  countdown: number; // 3, 2, 1, 0 (GO)
  cameraMode: CameraMode;
  dots: MinimapDot[];
  licenseProgressM: number;
  licenseTargetM: number;
  licenseStopStartM?: number;
  licenseStopEndM?: number;
  licenseStatusText?: string;
  wrongWay: boolean;
}

export interface SessionConfig {
  mode: RaceMode;
  carId: string;
  trackId: TrackId;
  timeOfDay: TimeOfDay;
  visual: CarVisualConfig;
  tuning: TuningState;
  assists: AssistSettings;
  defaultCamera?: CameraMode;
  licenseId?: LicenseTestId;
  totalLaps: number;
}

export interface SessionResult {
  mode: RaceMode;
  success: boolean;
  title: string;
  subtitle: string;
  totalTime: number;
  bestLapTime: number | null;
  position?: number;
  totalCars?: number;
  medal?: MedalType;
  creditsEarned: number;
  failReason?: string;
  licenseId?: LicenseTestId;
}
