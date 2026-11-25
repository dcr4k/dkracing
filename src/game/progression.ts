import {
  CARS,
  CHASSIS_UPGRADES,
  DEFAULT_CAR_ID,
  DEFAULT_PLAYER_GLB_URL,
  DEFAULT_TUNING,
  ENGINE_UPGRADES,
  GT_WING_PRICE,
  LICENSE_TESTS,
  PAINT_ITEMS,
  RIM_OPTIONS,
  STARTING_CREDITS,
  TIRE_UPGRADES,
  TRACKS,
  WEIGHT_UPGRADES,
  getCarById,
  getLicenseById,
  getPaintById,
  getRimById,
} from './catalog';
import {
  AssistSettings,
  CameraMode,
  CarSpec,
  CarVisualConfig,
  EffectiveCarSpecs,
  LicenseTestId,
  MedalType,
  PaintFinish,
  RimStyle,
  SaveState,
  SteeringMode,
  TimeOfDay,
  TrackId,
  TuningPartOption,
  TuningState,
} from './types';

export const STORAGE_KEY = 'apex_turismo_4_save_v1';

export function createInitialSaveState(): SaveState {
  const allCarIds = CARS.map((c) => c.id);
  const tuningByCar: Record<string, TuningState> = {};
  const ownedTiresByCar: Record<string, number[]> = {};
  for (const cid of allCarIds) {
    tuningByCar[cid] = { ...DEFAULT_TUNING };
    ownedTiresByCar[cid] = [0, 1, 2, 3];
  }

  return {
    credits: STARTING_CREDITS,
    ownedCarIds: allCarIds,
    selectedCarId: DEFAULT_CAR_ID,
    tuningByCar,
    ownedTiresByCar,
    ownedPaintIds: PAINT_ITEMS.map((p) => p.id),
    paintByCar: {},
    paintFinishByCar: {},
    ownedRimStyles: RIM_OPTIONS.map((r) => r.id),
    rimStyleByCar: {},
    ownedGtWingCars: [...allCarIds],
    gtWingByCar: {},
    licenseRecords: {
      'B-1': { bestTime: null, medal: 'none', claimedGold: false, claimedSilver: false, claimedBronze: false },
      'B-2': { bestTime: null, medal: 'none', claimedGold: false, claimedSilver: false, claimedBronze: false },
      'B-3': { bestTime: null, medal: 'none', claimedGold: false, claimedSilver: false, claimedBronze: false },
    },
    bestCircuitLapSec: null,
    racesWon: 0,
    assists: {
      tcs: true,
      abs: true,
      transmission: 'auto',
    },
    defaultCamera: 'chase',
    steeringMode: 'buttons',
    selectedTrackId: 'grand_prix',
    selectedTimeOfDay: 'day',
    muted: false,
  };
}

export function loadSaveState(): SaveState {
  const fallback = createInitialSaveState();
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    const allCarIds = CARS.map((c) => c.id);
    const ownedCarIds = [...allCarIds];
    const selectedCarId =
      parsed.selectedCarId && ownedCarIds.includes(parsed.selectedCarId)
        ? parsed.selectedCarId
        : ownedCarIds[0];

    const tuningByCar: Record<string, TuningState> = { ...fallback.tuningByCar };
    const ownedTiresByCar: Record<string, number[]> = {};
    for (const carId of ownedCarIds) {
      const t = parsed.tuningByCar?.[carId];
      if (t) {
        const ts = clampStage(t.tireStage, 3) as 0 | 1 | 2 | 3;
        tuningByCar[carId] = {
          engineStage: clampStage(t.engineStage, 3) as 0 | 1 | 2 | 3,
          weightStage: clampStage(t.weightStage, 3) as 0 | 1 | 2 | 3,
          tireStage: ts,
          chassisStage: clampStage(t.chassisStage, 3) as 0 | 1 | 2 | 3,
        };
      } else {
        tuningByCar[carId] = { ...DEFAULT_TUNING };
      }
      ownedTiresByCar[carId] = [0, 1, 2, 3];
    }

    const ownedPaintIds = PAINT_ITEMS.map((p) => p.id);

    const paintByCar: Record<string, string> = {};
    if (parsed.paintByCar && typeof parsed.paintByCar === 'object') {
      for (const [cid, pid] of Object.entries(parsed.paintByCar)) {
        if (typeof pid === 'string' && ownedPaintIds.includes(pid)) {
          paintByCar[cid] = pid;
        }
      }
    }

    const paintFinishByCar: Record<string, PaintFinish> = {};
    if (parsed.paintFinishByCar && typeof parsed.paintFinishByCar === 'object') {
      for (const [cid, fin] of Object.entries(parsed.paintFinishByCar)) {
        if (fin === 'metallic' || fin === 'matte' || fin === 'chrome') {
          paintFinishByCar[cid] = fin;
        }
      }
    }

    const ownedRimStyles: RimStyle[] = RIM_OPTIONS.map((r) => r.id);

    const rimStyleByCar: Record<string, RimStyle> = {};
    if (parsed.rimStyleByCar && typeof parsed.rimStyleByCar === 'object') {
      for (const [cid, rid] of Object.entries(parsed.rimStyleByCar)) {
        if (ownedRimStyles.includes(rid as RimStyle)) {
          rimStyleByCar[cid] = rid as RimStyle;
        }
      }
    }

    const ownedGtWingCars = Array.from(new Set([...ownedCarIds]));
    const gtWingByCar: Record<string, boolean> = {};
    if (parsed.gtWingByCar && typeof parsed.gtWingByCar === 'object') {
      for (const [cid, equipped] of Object.entries(parsed.gtWingByCar)) {
        if (ownedGtWingCars.includes(cid) && Boolean(equipped)) {
          gtWingByCar[cid] = true;
        }
      }
    }

    const licenseRecords = { ...fallback.licenseRecords };
    if (parsed.licenseRecords && typeof parsed.licenseRecords === 'object') {
      for (const test of LICENSE_TESTS) {
        const rec = parsed.licenseRecords[test.id];
        if (rec) {
          licenseRecords[test.id] = {
            bestTime: typeof rec.bestTime === 'number' ? rec.bestTime : null,
            medal: rec.medal ?? 'none',
            claimedGold: Boolean(rec.claimedGold),
            claimedSilver: Boolean(rec.claimedSilver),
            claimedBronze: Boolean(rec.claimedBronze),
          };
        }
      }
    }

    const defaultCamera: CameraMode =
      parsed.defaultCamera === 'bumper' || parsed.defaultCamera === 'cinematic'
        ? parsed.defaultCamera
        : 'chase';

    const steeringMode: SteeringMode =
      parsed.steeringMode === 'wheel' || parsed.steeringMode === 'gyro'
        ? parsed.steeringMode
        : 'buttons';

    const selectedTrackId: TrackId = TRACKS.some((t) => t.id === parsed.selectedTrackId)
      ? (parsed.selectedTrackId as TrackId)
      : 'grand_prix';

    const selectedTimeOfDay: TimeOfDay =
      parsed.selectedTimeOfDay === 'sunset' || parsed.selectedTimeOfDay === 'night'
        ? parsed.selectedTimeOfDay
        : 'day';

    return {
      credits:
        typeof parsed.credits === 'number' && parsed.credits >= 0
          ? Math.round(parsed.credits)
          : fallback.credits,
      ownedCarIds,
      selectedCarId,
      tuningByCar,
      ownedTiresByCar,
      ownedPaintIds,
      paintByCar,
      paintFinishByCar,
      ownedRimStyles,
      rimStyleByCar,
      ownedGtWingCars,
      gtWingByCar,
      licenseRecords,
      bestCircuitLapSec: typeof parsed.bestCircuitLapSec === 'number' ? parsed.bestCircuitLapSec : null,
      racesWon: typeof parsed.racesWon === 'number' ? parsed.racesWon : 0,
      assists: {
        tcs: parsed.assists?.tcs ?? fallback.assists.tcs,
        abs: parsed.assists?.abs ?? fallback.assists.abs,
        transmission: parsed.assists?.transmission === 'manual' ? 'manual' : 'auto',
      },
      defaultCamera,
      steeringMode,
      selectedTrackId,
      selectedTimeOfDay,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return fallback;
  }
}

export function persistSaveState(state: SaveState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function clampStage(val: unknown, max: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return 0;
  return Math.max(0, Math.min(max, Math.round(val)));
}

export function getCarTuning(state: SaveState, carId: string): TuningState {
  return state.tuningByCar[carId] ?? { ...DEFAULT_TUNING };
}

export function getCarOwnedTires(state: SaveState, carId: string): number[] {
  const t = getCarTuning(state, carId);
  const list = state.ownedTiresByCar[carId] ?? [0];
  return Array.from(new Set([0, t.tireStage, ...list]));
}

export function getCarPaintHex(state: SaveState, carId: string): string | undefined {
  const paintId = state.paintByCar[carId];
  if (!paintId || paintId === 'stock') return undefined;
  const item = getPaintById(paintId);
  return item.hex || undefined;
}

export function getCarVisualConfig(state: SaveState, carId: string): CarVisualConfig {
  const car = getCarById(carId);
  const tuning = getCarTuning(state, carId);
  const rideDropByStage = [0, 0.03, 0.06, 0.09];
  return {
    paintHex: getCarPaintHex(state, carId),
    paintFinish: state.paintFinishByCar[carId] ?? 'metallic',
    rimStyle: state.rimStyleByCar[carId] ?? 'stock_5spoke',
    gtWing: Boolean(state.gtWingByCar[carId]),
    rideHeightDropM: rideDropByStage[tuning.chassisStage] ?? 0,
    glbUrl: car.glbUrl ?? (carId === state.selectedCarId ? DEFAULT_PLAYER_GLB_URL : undefined),
  };
}

export function setCarPaintFinish(state: SaveState, carId: string, finish: PaintFinish): SaveState {
  return {
    ...state,
    paintFinishByCar: {
      ...state.paintFinishByCar,
      [carId]: finish,
    },
  };
}

export function buyOrEquipPaint(
  state: SaveState,
  carId: string,
  paintId: string,
): { ok: boolean; state: SaveState; message: string } {
  const paint = getPaintById(paintId);
  const owned = state.ownedPaintIds.includes(paint.id) || paint.price === 0;

  if (!owned) {
    if (state.credits < paint.price) {
      return {
        ok: false,
        state,
        message: `Créditos insuficientes. Necessário ${paint.price.toLocaleString('pt-BR')} Cr.`,
      };
    }
    const next: SaveState = {
      ...state,
      credits: state.credits - paint.price,
      ownedPaintIds: [...state.ownedPaintIds, paint.id],
      paintByCar: {
        ...state.paintByCar,
        [carId]: paint.id,
      },
    };
    return { ok: true, state: next, message: `Pintura ${paint.name} comprada e aplicada!` };
  }

  const nextPaintByCar = { ...state.paintByCar };
  if (paint.id === 'stock') {
    delete nextPaintByCar[carId];
  } else {
    nextPaintByCar[carId] = paint.id;
  }
  return {
    ok: true,
    state: {
      ...state,
      paintByCar: nextPaintByCar,
    },
    message: `Pintura ${paint.name} aplicada ao veículo!`,
  };
}

export function buyOrEquipRim(
  state: SaveState,
  carId: string,
  rimId: RimStyle,
): { ok: boolean; state: SaveState; message: string } {
  const rim = getRimById(rimId);
  const owned = state.ownedRimStyles.includes(rim.id) || rim.price === 0;

  if (!owned) {
    if (state.credits < rim.price) {
      return {
        ok: false,
        state,
        message: `Créditos insuficientes. Necessário ${rim.price.toLocaleString('pt-BR')} Cr.`,
      };
    }
    return {
      ok: true,
      state: {
        ...state,
        credits: state.credits - rim.price,
        ownedRimStyles: [...state.ownedRimStyles, rim.id],
        rimStyleByCar: {
          ...state.rimStyleByCar,
          [carId]: rim.id,
        },
      },
      message: `Rodas ${rim.name} compradas e equipadas!`,
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      rimStyleByCar: {
        ...state.rimStyleByCar,
        [carId]: rim.id,
      },
    },
    message: `Rodas ${rim.name} equipadas!`,
  };
}

export function buyOrToggleGtWing(
  state: SaveState,
  carId: string,
): { ok: boolean; state: SaveState; message: string } {
  const owned = state.ownedGtWingCars.includes(carId);
  if (!owned) {
    if (state.credits < GT_WING_PRICE) {
      return {
        ok: false,
        state,
        message: `Créditos insuficientes. Necessário ${GT_WING_PRICE.toLocaleString('pt-BR')} Cr.`,
      };
    }
    return {
      ok: true,
      state: {
        ...state,
        credits: state.credits - GT_WING_PRICE,
        ownedGtWingCars: [...state.ownedGtWingCars, carId],
        gtWingByCar: {
          ...state.gtWingByCar,
          [carId]: true,
        },
      },
      message: 'Aerofólio GT instalado (+downforce em alta velocidade)!',
    };
  }

  const nextEquipped = !state.gtWingByCar[carId];
  return {
    ok: true,
    state: {
      ...state,
      gtWingByCar: {
        ...state.gtWingByCar,
        [carId]: nextEquipped,
      },
    },
    message: nextEquipped ? 'Aerofólio GT equipado!' : 'Aerofólio GT removido (visual original).',
  };
}

export function computeEffectiveSpecs(
  car: CarSpec,
  tuning: TuningState,
  hasGtWing = false,
): EffectiveCarSpecs {
  const engineMults = [1.0, 1.16, 1.34, 1.58];
  const weightMults = [1.0, 0.92, 0.84, 0.77];
  // 0: Rua, 1: Esportivo, 2: Semi-Slick, 3: Drift
  const tireLatMu = [1.05, 1.28, 1.56, 0.92];
  const tireLongMu = [1.04, 1.26, 1.52, 1.02];
  const brakeMults = [1.0, 1.20, 1.36, 1.52];
  const rollMults = [1.0, 1.40, 2.0, 2.8];
  const rideDropM = [0, 0.03, 0.06, 0.09];

  const engMult = engineMults[tuning.engineStage] ?? 1.0;
  const wMult = weightMults[tuning.weightStage] ?? 1.0;
  const latMu = tireLatMu[tuning.tireStage] ?? 1.05;
  const longMu = tireLongMu[tuning.tireStage] ?? 1.04;
  const isDriftTire = tuning.tireStage === 3;
  const brakeMult = brakeMults[tuning.chassisStage] ?? 1.0;
  const rollMult = rollMults[tuning.chassisStage] ?? 1.0;

  const hp = Math.round(car.baseHp * engMult);
  const torqueNm = Math.round(car.baseTorqueNm * engMult);
  const massKg = Math.round(car.baseMassKg * wMult);
  const baseBrakeN = massKg * 11.4; // ~1.16G base braking capacity
  const extraSteerDeg = isDriftTire ? 7 : 0;

  // Calibração EV realista: Estágio 0 preserva os tempos reais de fábrica (ex: Dolphin Mini 0-50 em 3.5s, 0-100 em 11s, máx 133 km/h; BYD Seal 0-100 em 3.0s, máx 180 km/h)
  const perfBoost = Math.pow(engMult / wMult, 0.42);
  const baseMaxSpeed = car.maxSpeedKmh ?? 215;
  const maxSpeedKmh = Number((baseMaxSpeed * (1 + tuning.engineStage * 0.045)).toFixed(1));
  const evZeroToFiftySec = Number(((car.evZeroToFiftySec ?? 3.5) / perfBoost).toFixed(2));
  const evZeroToHundredSec = Number(((car.evZeroToHundredSec ?? 11.0) / perfBoost).toFixed(2));

  return {
    hp,
    torqueNm,
    massKg,
    powerToWeight: Number((massKg / hp).toFixed(2)),
    tireGripMu: latMu,
    tireLongGripMu: longMu,
    rearLateralBias: isDriftTire ? 0.72 : 1.0,
    isDriftTire,
    hasTurbo: tuning.engineStage >= 1 && !car.isElectric,
    rideHeightDropM: rideDropM[tuning.chassisStage] ?? 0,
    brakeForceN: baseBrakeN * brakeMult,
    rollStiffness: 1.0 * rollMult,
    pitchStiffness: 1.0 * rollMult,
    frontWeightRatio: car.frontWeightRatio,
    drivetrain: car.drivetrain,
    redlineRpm: car.redlineRpm + (tuning.engineStage >= 3 ? 600 : tuning.engineStage >= 2 ? 300 : 0),
    idleRpm: car.idleRpm,
    maxSteerRad: ((car.maxSteerDeg + extraSteerDeg) * Math.PI) / 180,
    wheelbaseM: car.wheelbaseM,
    cgHeightM: Math.max(0.32, car.cgHeightM - (rideDropM[tuning.chassisStage] ?? 0) * 0.5),
    dragCoeff: car.dragCoeff + (hasGtWing ? 0.015 : 0),
    downforceCoeff: car.downforceCoeff + tuning.chassisStage * 0.05 + (hasGtWing ? 0.14 : 0),
    gearRatios: car.gearRatios,
    finalDrive: tuning.engineStage >= 3 ? car.finalDrive * 0.93 : car.finalDrive, // higher top speed on Stage 3
    reverseRatio: car.reverseRatio,
    isElectric: Boolean(car.isElectric),
    maxSpeedKmh,
    evZeroToFiftySec,
    evZeroToHundredSec,
  };
}

export function buyCar(
  state: SaveState,
  carId: string,
): { ok: boolean; state: SaveState; message: string } {
  const car = getCarById(carId);
  if (state.ownedCarIds.includes(car.id)) {
    return { ok: false, state, message: 'Você já possui este veículo na garagem.' };
  }
  if (state.credits < car.price) {
    return {
      ok: false,
      state,
      message: `Créditos insuficientes. Faltam ${(car.price - state.credits).toLocaleString('pt-BR')} Cr.`,
    };
  }
  const next: SaveState = {
    ...state,
    credits: state.credits - car.price,
    ownedCarIds: [...state.ownedCarIds, car.id],
    selectedCarId: car.id,
    tuningByCar: {
      ...state.tuningByCar,
      [car.id]: { ...DEFAULT_TUNING },
    },
    ownedTiresByCar: {
      ...state.ownedTiresByCar,
      [car.id]: [0, 1, 2, 3],
    },
    ownedGtWingCars: Array.from(new Set([...state.ownedGtWingCars, car.id])),
  };
  return { ok: true, state: next, message: `${car.manufacturer} ${car.name} adquirido e equipado!` };
}

export function selectCar(state: SaveState, carId: string): SaveState {
  if (!state.ownedCarIds.includes(carId)) return state;
  return { ...state, selectedCarId: carId };
}

export type TuningCategory = 'engineStage' | 'weightStage' | 'tireStage' | 'chassisStage';

export function getUpgradeOption(category: TuningCategory, stage: number): TuningPartOption {
  const list =
    category === 'engineStage'
      ? ENGINE_UPGRADES
      : category === 'weightStage'
        ? WEIGHT_UPGRADES
        : category === 'tireStage'
          ? TIRE_UPGRADES
          : CHASSIS_UPGRADES;
  return list[stage] ?? list[0];
}

export function buyTuningUpgrade(
  state: SaveState,
  carId: string,
  category: TuningCategory,
  targetStage: number,
): { ok: boolean; state: SaveState; message: string } {
  if (!state.ownedCarIds.includes(carId)) {
    return { ok: false, state, message: 'Veículo não encontrado na garagem.' };
  }
  const current = getCarTuning(state, carId);
  const option = getUpgradeOption(category, targetStage);

  // Tires can be bought independently and swapped freely once owned (e.g. Semi-Slick <-> Drift)
  if (category === 'tireStage') {
    const ownedTires = getCarOwnedTires(state, carId);
    if (ownedTires.includes(targetStage)) {
      if (current.tireStage === targetStage) {
        return { ok: false, state, message: `${option.name} já está equipado.` };
      }
      return {
        ok: true,
        state: {
          ...state,
          tuningByCar: {
            ...state.tuningByCar,
            [carId]: { ...current, tireStage: targetStage as 0 | 1 | 2 | 3 },
          },
        },
        message: `${option.name} equipado!`,
      };
    }

    if (state.credits < option.price) {
      return {
        ok: false,
        state,
        message: `Créditos insuficientes. Necessário ${option.price.toLocaleString('pt-BR')} Cr.`,
      };
    }

    return {
      ok: true,
      state: {
        ...state,
        credits: state.credits - option.price,
        ownedTiresByCar: {
          ...state.ownedTiresByCar,
          [carId]: [...ownedTires, targetStage],
        },
        tuningByCar: {
          ...state.tuningByCar,
          [carId]: { ...current, tireStage: targetStage as 0 | 1 | 2 | 3 },
        },
      },
      message: `${option.name} comprado e instalado!`,
    };
  }

  const currentStage = current[category];
  if (targetStage === currentStage) {
    return { ok: false, state, message: `${option.name} já está equipado.` };
  }
  const isFreeOrUnlocked = option.price === 0 || targetStage < currentStage;
  const cost = isFreeOrUnlocked ? 0 : option.price;
  if (state.credits < cost) {
    return {
      ok: false,
      state,
      message: `Créditos insuficientes. Necessário ${cost.toLocaleString('pt-BR')} Cr.`,
    };
  }

  const nextTuning: TuningState = {
    ...current,
    [category]: targetStage,
  };

  return {
    ok: true,
    state: {
      ...state,
      credits: state.credits - cost,
      tuningByCar: {
        ...state.tuningByCar,
        [carId]: nextTuning,
      },
    },
    message: `${option.name} equipado com sucesso!`,
  };
}

export function evaluateLicenseMedal(licenseId: LicenseTestId, elapsedSec: number, valid: boolean): MedalType {
  if (!valid) return 'none';
  const def = getLicenseById(licenseId);
  if (elapsedSec <= def.goldTime) return 'gold';
  if (elapsedSec <= def.silverTime) return 'silver';
  if (elapsedSec <= def.bronzeTime) return 'bronze';
  return 'none';
}

const MEDAL_RANK: Record<MedalType, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

export function recordLicenseResult(
  state: SaveState,
  licenseId: LicenseTestId,
  elapsedSec: number,
  valid: boolean,
): { state: SaveState; medal: MedalType; creditsEarned: number } {
  const def = getLicenseById(licenseId);
  const medal = evaluateLicenseMedal(licenseId, elapsedSec, valid);
  const prev = state.licenseRecords[licenseId];

  let creditsEarned = 0;
  let claimedBronze = prev.claimedBronze;
  let claimedSilver = prev.claimedSilver;
  let claimedGold = prev.claimedGold;

  if (MEDAL_RANK[medal] >= 1 && !claimedBronze) {
    creditsEarned += def.rewards.bronze;
    claimedBronze = true;
  }
  if (MEDAL_RANK[medal] >= 2 && !claimedSilver) {
    creditsEarned += def.rewards.silver;
    claimedSilver = true;
  }
  if (MEDAL_RANK[medal] >= 3 && !claimedGold) {
    creditsEarned += def.rewards.gold;
    claimedGold = true;
  }

  const bestMedal = MEDAL_RANK[medal] > MEDAL_RANK[prev.medal] ? medal : prev.medal;
  const bestTime =
    valid && (prev.bestTime === null || elapsedSec < prev.bestTime) ? elapsedSec : prev.bestTime;

  const nextState: SaveState = {
    ...state,
    credits: state.credits + creditsEarned,
    licenseRecords: {
      ...state.licenseRecords,
      [licenseId]: {
        bestTime,
        medal: bestMedal,
        claimedBronze,
        claimedSilver,
        claimedGold,
      },
    },
  };

  return { state: nextState, medal, creditsEarned };
}

export function calculateRacePayout(position: number): number {
  if (position === 1) return 6000;
  if (position === 2) return 3500;
  if (position === 3) return 2000;
  return 1000;
}

export function recordRaceResult(
  state: SaveState,
  position: number,
  bestLapSec: number | null,
  isTimeTrial: boolean,
): { state: SaveState; creditsEarned: number } {
  const creditsEarned = isTimeTrial ? 1200 : calculateRacePayout(position);
  const nextBestLap =
    bestLapSec !== null &&
    (state.bestCircuitLapSec === null || bestLapSec < state.bestCircuitLapSec)
      ? bestLapSec
      : state.bestCircuitLapSec;

  const nextState: SaveState = {
    ...state,
    credits: state.credits + creditsEarned,
    bestCircuitLapSec: nextBestLap,
    racesWon: !isTimeTrial && position === 1 ? state.racesWon + 1 : state.racesWon,
  };
  return { state: nextState, creditsEarned };
}

export function updateAssists(state: SaveState, partial: Partial<AssistSettings>): SaveState {
  return {
    ...state,
    assists: {
      ...state.assists,
      ...partial,
    },
  };
}

export function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
