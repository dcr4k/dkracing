import {
  CarSpec,
  LicenseTestDef,
  PaintFinish,
  PaintItem,
  RimOption,
  RimStyle,
  TimeOfDay,
  TrackId,
  TrackMeta,
  TuningPartOption,
  TuningState,
} from './types';

export const STARTING_CREDITS = 10000;
export const DEFAULT_CAR_ID = 'byd_dolphin_mini';
export const GT_WING_PRICE = 0;
export const DEFAULT_PLAYER_GLB_URL =
  'https://storage.googleapis.com/se7evideos/2024_byd_dolphin_mini.glb';
export const BYD_SEAL_GLB_URL =
  'https://storage.googleapis.com/se7evideos/2024_byd_seal.glb';

export const CARS: CarSpec[] = [
  {
    id: 'byd_dolphin_mini',
    name: "BYD Dolphin Mini '24",
    manufacturer: 'BYD',
    year: 2024,
    drivetrain: 'FF',
    bodyStyle: 'hatch',
    price: 0,
    colorHex: '#f1f3f5',
    accentHex: '#1e293b',
    rimHex: '#e2e8f0',
    glbUrl: DEFAULT_PLAYER_GLB_URL,
    targetLengthM: 4.3,
    isElectric: true,
    maxSpeedKmh: 133,
    evZeroToFiftySec: 3.5,
    evZeroToHundredSec: 11.0,
    baseHp: 75,
    baseTorqueNm: 135,
    baseMassKg: 1160,
    redlineRpm: 14000,
    idleRpm: 800,
    maxSteerDeg: 36,
    wheelbaseM: 2.50,
    cgHeightM: 0.46,
    frontWeightRatio: 0.58,
    dragCoeff: 0.30,
    downforceCoeff: 0.14,
    gearRatios: [3.48, 2.18, 1.52, 1.18, 0.96, 0.76],
    finalDrive: 4.10,
    reverseRatio: 3.0,
    description:
      'Compacto 100% elétrico ágil no trânsito urbano: arrancada imediata de 0 a 50 km/h em 3,5s, 0 a 100 km/h em 11s e velocidade máxima limitada a 133 km/h.',
    handlingNote:
      'Tração dianteira (FF Elétrico): torque instantâneo na saída de curva e limitador eletrônico em 133 km/h.',
  },
  {
    id: 'byd_seal',
    name: "BYD Seal AWD '24",
    manufacturer: 'BYD',
    year: 2024,
    drivetrain: '4WD',
    bodyStyle: 'sedan_gtr',
    price: 0,
    colorHex: '#38bdf8',
    accentHex: '#0f172a',
    rimHex: '#cbd5e1',
    glbUrl: BYD_SEAL_GLB_URL,
    targetLengthM: 4.65,
    isElectric: true,
    maxSpeedKmh: 180,
    evZeroToFiftySec: 1.35,
    evZeroToHundredSec: 3.0,
    baseHp: 530,
    baseTorqueNm: 670,
    baseMassKg: 2150,
    redlineRpm: 16000,
    idleRpm: 800,
    maxSteerDeg: 35,
    wheelbaseM: 2.92,
    cgHeightM: 0.41,
    frontWeightRatio: 0.50,
    dragCoeff: 0.219,
    downforceCoeff: 0.26,
    gearRatios: [3.20, 2.05, 1.44, 1.12, 0.90, 0.74],
    finalDrive: 3.90,
    reverseRatio: 3.0,
    description:
      'Sedã fastback elétrico Dual-Motor AWD de 530 cv e 670 Nm: aceleração brutal de 0 a 100 km/h em 3,0s, centro de gravidade baixo (Cell-to-Body) e limitador eletrônico em 180 km/h.',
    handlingNote:
      'Tração integral Dual-Motor (4WD Elétrico 50/50): tração explosiva nas 4 rodas com distribuição instantânea de torque.',
  },
];

export const TRACKS: TrackMeta[] = [
  {
    id: 'grand_prix',
    name: 'Circuito Grand Prix',
    subtitle: 'Rápido e técnico com retas longas, S de alta e hairpin',
    lengthKm: '1,55 km',
    difficulty: 'Equilibrado',
    recommendedTime: 'day',
    environmentType: 'circuit',
  },
  {
    id: 'serra_touge',
    name: 'Serra Touge',
    subtitle: 'Estrada de montanha com aclives e curvas fechadas para drift',
    lengthKm: '1,38 km',
    difficulty: 'Técnico / Drift',
    recommendedTime: 'sunset',
    environmentType: 'touge',
  },
  {
    id: 'night_expressway',
    name: 'Via Expressa Noturna',
    subtitle: 'Anel rodoviário iluminado de altíssima velocidade',
    lengthKm: '2,12 km',
    difficulty: 'Alta Velocidade',
    recommendedTime: 'night',
    environmentType: 'expressway',
  },
];

export const TIME_OF_DAY_OPTIONS: Array<{ id: TimeOfDay; label: string; hint: string }> = [
  { id: 'day', label: 'Dia Ensolarado', hint: 'Céu limpo e alta visibilidade' },
  { id: 'sunset', label: 'Pôr do Sol', hint: 'Luz dourada e sombras longas' },
  { id: 'night', label: 'Noite', hint: 'Faróis ativos e iluminação da pista' },
];

export const PAINT_FINISH_OPTIONS: Array<{ id: PaintFinish; label: string; hint: string }> = [
  { id: 'metallic', label: 'Metálico', hint: 'Verniz Clearcoat brilhante' },
  { id: 'matte', label: 'Fosco', hint: 'Acabamento acetinado stealth' },
  { id: 'chrome', label: 'Cromado', hint: 'Reflexo espelhado de estúdio' },
];

export const PAINT_ITEMS: PaintItem[] = [
  { id: 'stock', name: 'Pintura Original', hex: '', price: 0, finish: 'Fábrica' },
  { id: 'championship_white', name: 'Branco Championship', hex: '#f1f5f9', price: 0, finish: 'Perolizado' },
  { id: 'midnight_black', name: 'Preto Carbono', hex: '#1e293b', price: 0, finish: 'Metálico' },
  { id: 'bayside_blue', name: 'Azul Bayside', hex: '#1d4ed8', price: 0, finish: 'Metálico' },
  { id: 'crimson_red', name: 'Vermelho Competição', hex: '#dc2626', price: 0, finish: 'Gloss GT' },
  { id: 'sunburst_yellow', name: 'Amarelo Sunburst', hex: '#facc15', price: 0, finish: 'Esportivo' },
  { id: 'british_green', name: 'Verde Racing', hex: '#15803d', price: 0, finish: 'Clássico' },
  { id: 'sunset_orange', name: 'Laranja Sunset', hex: '#ea580c', price: 0, finish: 'Especial' },
];

export const RIM_OPTIONS: RimOption[] = [
  {
    id: 'stock_5spoke',
    name: '5 Raios OEM',
    price: 0,
    summary: 'Design clássico de 5 raios esportivos originais',
  },
  {
    id: 'mesh_gt',
    name: 'BBS Mesh GT',
    price: 0,
    summary: 'Multirraios em malha leve estilo turismo alemão',
  },
  {
    id: 'deep_dish',
    name: 'Deep Dish JDM',
    price: 0,
    summary: 'Borda funda polida com miolo dourado/escuro',
  },
  {
    id: 'aero_turbo',
    name: 'Aero Turbofan',
    price: 0,
    summary: 'Calota aerodinâmica fechada de competição',
  },
];

export const DEFAULT_TUNING: TuningState = {
  engineStage: 0,
  weightStage: 0,
  tireStage: 0,
  chassisStage: 0,
};

export const ENGINE_UPGRADES: TuningPartOption[] = [
  { stage: 0, name: 'Original de Fábrica', price: 0, summary: 'Aspiração e mapa originais' },
  {
    stage: 1,
    name: 'Motor & Turbo Estágio 1',
    price: 0,
    summary: '+16% HP/Torque · Kit Turbo + Válvula Blow-Off',
  },
  {
    stage: 2,
    name: 'Motor & Turbo Estágio 2',
    price: 0,
    summary: '+34% HP/Torque · Intercooler, ECU e +300 RPM',
  },
  {
    stage: 3,
    name: 'Motor & Turbo Estágio 3',
    price: 0,
    summary: '+58% HP/Torque · Turbina Corrida e Vel. Máxima',
  },
];

export const WEIGHT_UPGRADES: TuningPartOption[] = [
  { stage: 0, name: 'Chassi Original', price: 0, summary: 'Peso padrão de rua' },
  { stage: 1, name: 'Redução de Peso Estágio 1', price: 0, summary: '-8% Massa · Interior aliviado' },
  { stage: 2, name: 'Redução de Peso Estágio 2', price: 0, summary: '-16% Massa · Capô e portas em fibra' },
  { stage: 3, name: 'Chassi Carbono Estágio 3', price: 0, summary: '-23% Massa · Carroceria leve de competição' },
];

export const TIRE_UPGRADES: TuningPartOption[] = [
  { stage: 0, name: 'Pneus Rua', price: 0, summary: 'Aderência rua (μ 1.05) · Deslizamento progressivo' },
  { stage: 1, name: 'Pneus Esportivos', price: 0, summary: 'Aderência alta (μ 1.28) · Melhor curva e frenagem' },
  { stage: 2, name: 'Pneus Semi-Slick', price: 0, summary: 'Aderência máxima (μ 1.56) · Máxima força G lateral' },
  {
    stage: 3,
    name: 'Pneus Drift',
    price: 0,
    summary: 'Traseira solta controlada (μ 0.88) · Ângulo estendido de drift',
  },
];

export const CHASSIS_UPGRADES: TuningPartOption[] = [
  { stage: 0, name: 'Suspensão & Freios Originais', price: 0, summary: 'Altura e acerto originais de rua' },
  {
    stage: 1,
    name: 'Estágio 1 · Molas Esportivas',
    price: 0,
    summary: '+20% Frenagem · -28% Rolagem · Rebaixamento -30mm',
  },
  {
    stage: 2,
    name: 'Estágio 2 · Coilover & Brembo',
    price: 0,
    summary: '+36% Frenagem · -50% Rolagem · Rebaixamento -60mm',
  },
  {
    stage: 3,
    name: 'Estágio 3 · Suspensão Corrida Pro',
    price: 0,
    summary: '+52% Frenagem · -70% Rolagem · Rebaixamento -90mm',
  },
];

export const LICENSE_TESTS: LicenseTestDef[] = [
  {
    id: 'B-1',
    code: 'B-1',
    title: 'Aceleração e Frenagem (400m)',
    subtitle: 'Controle longitudinal e ponto de frenagem',
    description:
      'Acelere com força total na reta de 400 metros e imobilize o veículo completamente dentro da zona quadriculada de parada. Ultrapassar o limite final anula o teste.',
    carId: DEFAULT_CAR_ID,
    goldTime: 16.4,
    silverTime: 18.2,
    bronzeTime: 21.0,
    rewards: { bronze: 1200, silver: 2400, gold: 4500 },
    objectiveType: 'stop_zone',
    targetDistanceM: 365,
    stopZoneStartM: 332,
    stopZoneEndM: 382,
  },
  {
    id: 'B-2',
    code: 'B-2',
    title: 'Curva em U de Alta Velocidade',
    subtitle: 'Transferência de peso e tomada de hairpin',
    description:
      'Freie em linha reta antes da tomada do hairpin, transfira o peso para o eixo dianteiro para apontar o bico do veículo e acelere progressivamente até o pórtico.',
    carId: DEFAULT_CAR_ID,
    goldTime: 17.8,
    silverTime: 19.6,
    bronzeTime: 22.8,
    rewards: { bronze: 1500, silver: 3000, gold: 5500 },
    objectiveType: 'sector_sprint',
    targetDistanceM: 430,
  },
  {
    id: 'B-3',
    code: 'B-3',
    title: 'Chicane Técnica (S-Curves)',
    subtitle: 'Precisão de tangência nas zebras',
    description:
      'Domine a sequência esquerda-direita mantendo velocidade de tangência. Evite golpes bruscos no volante para não perder velocidade na saída.',
    carId: DEFAULT_CAR_ID,
    goldTime: 18.5,
    silverTime: 20.5,
    bronzeTime: 23.8,
    rewards: { bronze: 2000, silver: 4000, gold: 7000 },
    objectiveType: 'sector_sprint',
    targetDistanceM: 520,
  },
];

export function getCarById(id: string): CarSpec {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

export function getLicenseById(id: string): LicenseTestDef {
  return LICENSE_TESTS.find((l) => l.id === id) ?? LICENSE_TESTS[0];
}

export function getPaintById(id: string): PaintItem {
  return PAINT_ITEMS.find((p) => p.id === id) ?? PAINT_ITEMS[0];
}

export function getRimById(id: RimStyle): RimOption {
  return RIM_OPTIONS.find((r) => r.id === id) ?? RIM_OPTIONS[0];
}

export function getTrackMetaById(id: TrackId): TrackMeta {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
