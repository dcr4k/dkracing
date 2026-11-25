import {
  AssistSettings,
  ControlInput,
  EffectiveCarSpecs,
  TrackProjection,
  VehiclePhysicsState,
} from './types';

/**
 * Parâmetros físicos ajustáveis (Simcade estilo Gran Turismo 4).
 * Modifique estes valores para recalibrar sensibilidade de direção,
 * aderência lateral, transferência de peso e comportamento de derrapagem.
 */
export const PHYSICS_TUNING = {
  /** Velocidade de resposta do esterçamento (rad/s equivalente) */
  steerResponseRate: 7.5,
  /** Redução progressiva do ângulo máximo de esterço em alta velocidade (0..1) */
  speedSensitiveSteerFactor: 0.011,
  /** Rigidez de curva Pacejka (B) — maior = entrada mais afiada */
  pacejkaStiffnessB: 7.6,
  /** Fator de forma Pacejka (C) — controla a queda suave após o pico de aderência */
  pacejkaShapeC: 1.48,
  /** Multiplicador global de aderência lateral dos pneus */
  globalLateralGripScale: 1.12,
  /** Multiplicador global de tração longitudinal (aceleração/frenagem) */
  globalLongGripScale: 1.18,
  /** Intensidade da transferência longitudinal de peso (freio -> frente, aceleração -> trás) */
  weightTransferScale: 1.15,
  /** Amortecimento natural de guinada (evita giros irreais em baixa velocidade) */
  yawDamping: 2.8,
  /** Fator de perda de aderência traseira ao acionar o freio de mão */
  handbrakeRearGripFactor: 0.32,
  /** Multiplicador de aderência na grama / fora da pista */
  offTrackGripMultiplier: 0.62,
  /** Resistência de rolamento extra na grama */
  offTrackDragMultiplier: 3.4,
  /** Raio efetivo da roda em metros */
  wheelRadiusM: 0.32,
  /** Gravidade (m/s^2) */
  gravity: 9.81,
};

export function createInitialPhysicsState(
  x: number,
  y: number,
  z: number,
  heading: number,
  specs: EffectiveCarSpecs,
): VehiclePhysicsState {
  return {
    x,
    y,
    z,
    heading,
    vx: 0,
    vz: 0,
    localVx: 0,
    localVz: 0,
    yawRate: 0,
    steerAngle: 0,
    rpm: specs.idleRpm,
    gear: 1,
    shiftCooldown: 0,
    wheelSpinRad: 0,
    speedKmh: 0,
    longG: 0,
    latG: 0,
    frontLoadRatio: specs.frontWeightRatio,
    rearLoadRatio: 1 - specs.frontWeightRatio,
    pitchRad: 0,
    rollRad: 0,
    frontSlip: 0,
    rearSlip: 0,
    tireScreech: 0,
    isBraking: false,
    absActive: false,
    tcsActive: false,
    onTrack: true,
    onCurb: false,
    surfaceMuScale: 1.0,
  };
}

/**
 * Curva de torque normalizada (0..1) em função do RPM relativo (0..1).
 * Simula resposta cheia em médias/altas rotações com queda perto do corte.
 */
export function evaluateTorqueCurve(rpmNormalized: number): number {
  const r = Math.max(0, Math.min(1.05, rpmNormalized));
  if (r < 0.15) return 0.52 + r * 1.4;
  if (r < 0.72) {
    // Sobe suavemente até o pico de torque em ~72% do redline
    const t = (r - 0.15) / 0.57;
    return 0.73 + 0.27 * Math.sin(t * Math.PI * 0.5);
  }
  if (r <= 0.96) {
    // Mantém alta potência até a faixa vermelha
    const t = (r - 0.72) / 0.24;
    return 1.0 - 0.12 * t * t;
  }
  // Queda suave ao encostar no limitador de giro
  return Math.max(0.15, 0.88 - (r - 0.96) * 8.0);
}

/**
 * Fórmula simplificada de Pacejka para força lateral de um eixo.
 * Retorna força lateral normalizada (-1..1 multiplicada pelo grip máximo Fz * mu).
 */
export function evaluatePacejkaLateral(slipAngleRad: number, maxForceN: number): number {
  const B = PHYSICS_TUNING.pacejkaStiffnessB;
  const C = PHYSICS_TUNING.pacejkaShapeC;
  const normalized = Math.sin(C * Math.atan(B * slipAngleRad));
  return -normalized * maxForceN;
}

/**
 * Distribuição de torque motriz entre eixo dianteiro e traseiro segundo a tração.
 */
export function getDrivetrainSplit(drivetrain: EffectiveCarSpecs['drivetrain']): {
  front: number;
  rear: number;
} {
  switch (drivetrain) {
    case 'FF':
      return { front: 1.0, rear: 0.0 };
    case 'FR':
      return { front: 0.0, rear: 1.0 };
    case 'MR':
      return { front: 0.0, rear: 1.0 };
    case '4WD':
      return { front: 0.35, rear: 0.65 };
  }
}

export interface PhysicsStepOutput {
  wallImpact: number; // 0 if no wall hit, >0 intensity for sound/camera shake/sparks
  wallSideSign: number; // -1 left barrier, +1 right barrier, 0 none
  shiftedUp: boolean; // true when upshift occurred (for turbo blow-off valve audio)
}

/**
 * Avança um passo da simulação Simcade de 4 rodas / bicicleta com transferência de peso.
 * Totalmente puro (sem alocação de objetos Three.js nem efeitos colaterais de DOM).
 */
export function stepVehiclePhysics(
  state: VehiclePhysicsState,
  input: ControlInput,
  specs: EffectiveCarSpecs,
  assists: AssistSettings,
  dtRaw: number,
  trackProj?: TrackProjection,
): PhysicsStepOutput {
  const dt = Math.min(Math.max(dtRaw, 0.001), 0.04);
  const g = PHYSICS_TUNING.gravity;

  // 1. Eixos locais do veículo (Forward = +Z rotacionado por heading; Left = +X rotacionado)
  const sinH = Math.sin(state.heading);
  const cosH = Math.cos(state.heading);
  const fwdX = sinH;
  const fwdZ = cosH;
  const leftX = cosH;
  const leftZ = -sinH;

  // Velocidade no referencial do carro: vFwd > 0 indo para frente, vLeft > 0 deslizando para esquerda
  const vFwd = state.vx * fwdX + state.vz * fwdZ;
  const vLeft = state.vx * leftX + state.vz * leftZ;
  const speedMs = Math.hypot(vFwd, vLeft);

  // Superfície (asfalto vs zebra vs grama)
  const onTrack = trackProj ? trackProj.onTrack : true;
  const onCurb = trackProj ? trackProj.onCurb : false;
  const surfaceMuScale = onTrack
    ? onCurb
      ? 0.94
      : 1.0
    : PHYSICS_TUNING.offTrackGripMultiplier;
  state.onTrack = onTrack;
  state.onCurb = onCurb;
  state.surfaceMuScale = surfaceMuScale;

  // 2. Câmbio (Manual ou Automático)
  state.shiftCooldown = Math.max(0, state.shiftCooldown - dt);
  const maxGear = specs.gearRatios.length;

  let throttle = Math.max(0, Math.min(1, input.throttle));
  let brake = Math.max(0, Math.min(1, input.brake));

  let shiftedUp = false;
  if (assists.transmission === 'manual') {
    if (input.shiftUpJustPressed && state.shiftCooldown <= 0 && state.gear < maxGear) {
      if (state.gear >= 1) shiftedUp = true;
      state.gear += 1;
      state.shiftCooldown = 0.16;
    } else if (input.shiftDownJustPressed && state.shiftCooldown <= 0 && state.gear > -1) {
      state.gear -= 1;
      state.shiftCooldown = 0.16;
    }
  } else {
    // Modo Automático: troca para ré se estiver quase parado e segurando freio
    if (state.gear >= 0 && brake > 0.35 && throttle < 0.05 && vFwd < 1.2) {
      state.gear = -1;
      state.shiftCooldown = 0.25;
    } else if (state.gear === -1 && throttle > 0.2 && vFwd > -1.2) {
      state.gear = 1;
      state.shiftCooldown = 0.25;
    } else if (state.gear === 0 && throttle > 0.1) {
      state.gear = 1;
    }

    // Trocas ascendentes/descendentes por RPM (carros elétricos usam transmissão direta em Drive no modo automático)
    if (!specs.isElectric && state.gear >= 1 && state.shiftCooldown <= 0) {
      if (state.rpm >= specs.redlineRpm * 0.93 && state.gear < maxGear && throttle > 0.2) {
        state.gear += 1;
        state.shiftCooldown = 0.24;
        shiftedUp = true;
      } else if (state.rpm <= specs.redlineRpm * 0.43 && state.gear > 1) {
        state.gear -= 1;
        state.shiftCooldown = 0.22;
      }
    }
  }

  // No modo automático em Ré, o pedal de freio atua como acelerador de ré e acelerador freia
  let effThrottle = throttle;
  let effBrake = brake;
  if (assists.transmission === 'auto' && state.gear === -1) {
    effThrottle = brake;
    effBrake = throttle;
  }

  // 3. Direção sensível à velocidade (suavizada para controle no teclado e gamepad)
  const speedReduction = 1 / (1 + speedMs * PHYSICS_TUNING.speedSensitiveSteerFactor * (speedMs * 0.08 + 0.55));
  const targetSteer = input.steer * specs.maxSteerRad * Math.max(0.24, speedReduction);
  const steerBlend = 1 - Math.exp(-PHYSICS_TUNING.steerResponseRate * dt);
  state.steerAngle += (targetSteer - state.steerAngle) * steerBlend;

  // 4. Dinâmica do Motor (Elétrico EV com curva real 0-50 / 0-100 + limitador eletrônico vs Combustão)
  const maxSpeedMs = (specs.maxSpeedKmh || 220) / 3.6;
  const aeroDragPreviewN = 0.5 * 1.225 * specs.dragCoeff * 2.15 * vFwd * Math.abs(vFwd);
  const rollingDragPreviewN =
    (onTrack ? 1.0 : PHYSICS_TUNING.offTrackDragMultiplier) *
    0.015 *
    specs.massKg *
    g *
    Math.tanh(vFwd * 2);

  let driveForceN = 0;
  let rpmNorm = 0;

  if (specs.isElectric) {
    const absSpeedKmh = Math.abs(vFwd) * 3.6;
    const speedRatio = Math.min(1.0, absSpeedKmh / Math.max(80, specs.maxSpeedKmh));
    const targetEvRpm =
      state.gear === 0
        ? specs.idleRpm + effThrottle * (specs.redlineRpm - specs.idleRpm) * 0.65
        : specs.idleRpm +
          speedRatio * (specs.redlineRpm - specs.idleRpm) * 0.92 +
          effThrottle * 520;
    state.rpm += (targetEvRpm - state.rpm) * (1 - Math.exp(-14 * dt));
    state.rpm = Math.max(specs.idleRpm, Math.min(specs.redlineRpm, state.rpm));
    rpmNorm = (state.rpm - specs.idleRpm) / Math.max(1000, specs.redlineRpm - specs.idleRpm);

    if (state.gear >= 1 && effThrottle > 0.001) {
      const v1 = 50 / 3.6; // 13.8889 m/s (50 km/h)
      const v2 = 100 / 3.6; // 27.7778 m/s (100 km/h)
      const t0to50 = Math.max(0.6, specs.evZeroToFiftySec || 3.5);
      const t50to100 = Math.max(0.5, (specs.evZeroToHundredSec || 11.0) - t0to50);
      const absV = Math.max(0, vFwd);

      let aTargetMs2: number;
      if (absV <= v1) {
        // Torque elétrico instantâneo de 0 a 50 km/h
        aTargetMs2 = v1 / t0to50;
      } else {
        // Regime de potência constante acima de 50 km/h calibrado para atingir 0-100 km/h no tempo exato
        const powerConstK = (0.5 * (v2 * v2 - v1 * v1)) / t50to100;
        aTargetMs2 = powerConstK / Math.max(v1, absV);
      }

      // Limitador eletrônico suave ao aproximar da velocidade máxima (133 km/h Dolphin Mini / 180 km/h Seal)
      const taperStartMs = Math.max(10, maxSpeedMs - 3.2 / 3.6);
      let limiterFactor = 1.0;
      if (absV >= maxSpeedMs) {
        limiterFactor = 0;
      } else if (absV > taperStartMs) {
        limiterFactor = Math.max(0, (maxSpeedMs - absV) / (maxSpeedMs - taperStartMs));
      }

      const netTargetForceN = specs.massKg * aTargetMs2 * effThrottle * limiterFactor;
      const dragCompN =
        (aeroDragPreviewN + (onTrack ? rollingDragPreviewN : rollingDragPreviewN * 0.35)) *
        effThrottle *
        limiterFactor;
      driveForceN = netTargetForceN + Math.max(0, dragCompN);
    } else if (state.gear === -1 && effThrottle > 0.001) {
      const revMaxMs = 34 / 3.6;
      const revLimiter = Math.max(0, Math.min(1, (revMaxMs - Math.abs(Math.min(0, vFwd))) / 2.5));
      driveForceN = -specs.massKg * 3.4 * effThrottle * revLimiter;
    }
  } else {
    const activeGearRatio =
      state.gear === -1
        ? specs.reverseRatio
        : state.gear >= 1
          ? specs.gearRatios[Math.min(maxGear, state.gear) - 1]
          : 0;

    const wheelRpm =
      (Math.abs(vFwd) / (2 * Math.PI * PHYSICS_TUNING.wheelRadiusM)) * 60;
    const coupledRpm =
      activeGearRatio > 0 ? wheelRpm * activeGearRatio * specs.finalDrive : specs.idleRpm;

    const targetRpm =
      state.gear === 0
        ? specs.idleRpm + effThrottle * (specs.redlineRpm - specs.idleRpm) * 0.95
        : Math.max(
            specs.idleRpm + effThrottle * 1400,
            coupledRpm + effThrottle * (speedMs < 5 ? 1600 : 120),
          );

    const rpmRate = targetRpm > state.rpm ? 11.0 : 6.5;
    state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-rpmRate * dt));

    // Limitador de giro (Rev Limiter)
    let revLimiterCut = 1.0;
    if (state.rpm >= specs.redlineRpm) {
      state.rpm = specs.redlineRpm - 120;
      revLimiterCut = 0.05;
    }
    state.rpm = Math.max(specs.idleRpm * 0.9, state.rpm);

    rpmNorm = (state.rpm - specs.idleRpm) / Math.max(1000, specs.redlineRpm - specs.idleRpm);
    const torqueFactor = evaluateTorqueCurve(rpmNorm);
    const engineTorqueNm = specs.torqueNm * torqueFactor * effThrottle * revLimiterCut;

    // Torque transmitido às rodas (N)
    const drivetrainEfficiency = 0.87;
    driveForceN =
      activeGearRatio > 0
        ? ((engineTorqueNm * activeGearRatio * specs.finalDrive * drivetrainEfficiency) /
            PHYSICS_TUNING.wheelRadiusM) *
          (state.gear === -1 ? -1 : 1)
        : 0;

    // Pequena redução durante a troca de marcha (corte de ignição)
    if (state.shiftCooldown > 0.14) {
      driveForceN *= 0.25;
    }
  }

  // 5. Carga Vertical Dinâmica (Transferência de Peso Longitudinal + Downforce)
  const staticWeightN = specs.massKg * g;
  const downforceN = 0.5 * 1.225 * specs.downforceCoeff * 2.1 * speedMs * speedMs;
  const totalVerticalN = staticWeightN + downforceN;

  // Transferência de peso baseada na aceleração longitudinal do passo anterior
  const prevAxMs2 = state.longG * g;
  const weightTransferN =
    ((specs.massKg * prevAxMs2 * specs.cgHeightM) / specs.wheelbaseM) *
    PHYSICS_TUNING.weightTransferScale;

  // Ao acelerar (prevAx > 0), peso vai para trás (-front, +rear); ao frear (prevAx < 0), peso vai para frente (+front, -rear)
  const rawFrontN = totalVerticalN * specs.frontWeightRatio - weightTransferN;
  const minAxleN = totalVerticalN * 0.24;
  const maxAxleN = totalVerticalN * 0.78;
  const frontNormalN = Math.max(minAxleN, Math.min(maxAxleN, rawFrontN));
  const rearNormalN = totalVerticalN - frontNormalN;

  state.frontLoadRatio = frontNormalN / totalVerticalN;
  state.rearLoadRatio = rearNormalN / totalVerticalN;

  // 6. Tração, Frenagem, TCS e ABS
  const split =
    specs.isElectric && specs.drivetrain === '4WD'
      ? { front: state.frontLoadRatio, rear: state.rearLoadRatio }
      : getDrivetrainSplit(specs.drivetrain);
  const evTractionBoost = specs.isElectric ? 1.18 : 1.0;
  const longMu =
    specs.tireLongGripMu * PHYSICS_TUNING.globalLongGripScale * surfaceMuScale * evTractionBoost;
  const latMu = specs.tireGripMu * PHYSICS_TUNING.globalLateralGripScale * surfaceMuScale;

  let frontDriveN = driveForceN * split.front;
  let rearDriveN = driveForceN * split.rear;

  const frontLongCap = frontNormalN * longMu;
  const rearLongCap = rearNormalN * longMu;

  // Controle de Tração (TCS): limita excesso de torque que causaria patinagem
  let tcsActive = false;
  let frontWheelSpinSlip = 0;
  let rearWheelSpinSlip = 0;

  if (Math.abs(frontDriveN) > frontLongCap * 0.94) {
    frontWheelSpinSlip = (Math.abs(frontDriveN) - frontLongCap * 0.94) / Math.max(1, frontLongCap);
    if (assists.tcs) {
      frontDriveN = Math.sign(frontDriveN) * frontLongCap * 0.94;
      tcsActive = true;
      frontWheelSpinSlip *= 0.2;
    } else {
      frontDriveN = Math.sign(frontDriveN) * frontLongCap * 1.03;
    }
  }

  if (Math.abs(rearDriveN) > rearLongCap * 0.94) {
    rearWheelSpinSlip = (Math.abs(rearDriveN) - rearLongCap * 0.94) / Math.max(1, rearLongCap);
    if (assists.tcs) {
      rearDriveN = Math.sign(rearDriveN) * rearLongCap * 0.94;
      tcsActive = true;
      rearWheelSpinSlip *= 0.2;
    } else {
      rearDriveN = Math.sign(rearDriveN) * rearLongCap * 1.03;
    }
  }
  state.tcsActive = tcsActive;

  // Frenagem + Distribuição 62% dianteira / 38% traseira + ABS
  const isBraking = effBrake > 0.05 || input.handbrake;
  state.isBraking = isBraking;
  let absActive = false;
  let frontBrakeLock = 0;
  let rearBrakeLock = 0;

  let brakeTotalN = 0;
  if (effBrake > 0.02 && Math.abs(vFwd) > 0.15) {
    const reqFrontBrake = specs.brakeForceN * 0.62 * effBrake;
    const reqRearBrake = specs.brakeForceN * 0.38 * effBrake;

    let actualFrontBrake = reqFrontBrake;
    let actualRearBrake = reqRearBrake;

    if (reqFrontBrake > frontLongCap * 0.95) {
      if (assists.abs) {
        actualFrontBrake = frontLongCap * 0.95;
        absActive = true;
      } else {
        actualFrontBrake = frontLongCap * 0.82; // Roda travada perde eficiência
        frontBrakeLock = 0.65;
      }
    }
    if (reqRearBrake > rearLongCap * 0.95) {
      if (assists.abs) {
        actualRearBrake = rearLongCap * 0.95;
        absActive = true;
      } else {
        actualRearBrake = rearLongCap * 0.80;
        rearBrakeLock = 0.70;
      }
    }
    brakeTotalN = actualFrontBrake + actualRearBrake;
  }

  if (input.handbrake && Math.abs(vFwd) > 0.2) {
    brakeTotalN += rearLongCap * 0.65;
    rearBrakeLock = Math.max(rearBrakeLock, 0.85);
  }
  state.absActive = absActive;

  // 7. Ângulos de Deriva (Slip Angles) e Modelo Lateral Pacejka com Círculo de Atrito
  const distFront = specs.wheelbaseM * (1 - specs.frontWeightRatio);
  const distRear = specs.wheelbaseM * specs.frontWeightRatio;

  let latForceFrontN = 0;
  let latForceRearN = 0;
  let frontSlipAngle = 0;
  let rearSlipAngle = 0;

  if (speedMs > 0.35) {
    const absFwd = Math.max(2.2, Math.abs(vFwd));
    const dirSign = vFwd >= 0 ? 1 : -1;

    // Velocidade lateral no eixo dianteiro e traseiro
    const vLatFront = vLeft + state.yawRate * distFront;
    const vLatRear = vLeft - state.yawRate * distRear;

    frontSlipAngle = Math.atan2(vLatFront, absFwd) - state.steerAngle * dirSign;
    rearSlipAngle = Math.atan2(vLatRear, absFwd);

    // Círculo de atrito: quanto mais força longitudinal o eixo usa, menos grip lateral sobra
    const frontLongUsage = Math.min(
      0.86,
      (Math.abs(frontDriveN) + (effBrake > 0.02 ? brakeTotalN * 0.62 : 0)) /
        Math.max(1, frontLongCap * 1.12),
    );
    const rearLongUsage = Math.min(
      0.88,
      (Math.abs(rearDriveN) + (effBrake > 0.02 ? brakeTotalN * 0.38 : 0)) /
        Math.max(1, rearLongCap * 1.12),
    );

    const frontCircleScale = Math.sqrt(Math.max(0.18, 1 - frontLongUsage * frontLongUsage * 0.72));
    const rearCircleScale = Math.sqrt(Math.max(0.16, 1 - rearLongUsage * rearLongUsage * 0.75));

    // Travamento sem ABS reduz capacidade direcional na frente e solta a traseira
    const frontLockScale = 1 - frontBrakeLock * 0.45;
    const rearHandbrakeScale = input.handbrake
      ? PHYSICS_TUNING.handbrakeRearGripFactor
      : 1 - rearBrakeLock * 0.35;

    // Característica sutil por tração + composto Drift (traseira progressiva para manter ângulo de drift)
    const mrRearBias = specs.drivetrain === 'MR' ? 0.96 : 1.0;
    const driftRearBias = specs.rearLateralBias ?? 1.0;
    const driftFrontBoost = specs.isDriftTire ? 1.12 : 1.0;

    const maxLatFrontN = frontNormalN * latMu * frontCircleScale * frontLockScale * driftFrontBoost;
    const maxLatRearN = rearNormalN * latMu * rearCircleScale * rearHandbrakeScale * mrRearBias * driftRearBias;

    latForceFrontN = evaluatePacejkaLateral(frontSlipAngle, maxLatFrontN);
    latForceRearN = evaluatePacejkaLateral(rearSlipAngle, maxLatRearN);
  }

  // 8. Arrasto Aerodinâmico, Resistência de Rolamento e Freio Motor
  const aeroDragN = 0.5 * 1.225 * specs.dragCoeff * 2.15 * vFwd * Math.abs(vFwd);
  const rollingDragN =
    (onTrack ? 1.0 : PHYSICS_TUNING.offTrackDragMultiplier) *
    0.015 *
    staticWeightN *
    Math.tanh(vFwd * 2);
  const engineBrakingN =
    effThrottle < 0.05 && Math.abs(vFwd) > 1.0 && state.gear !== 0
      ? Math.sign(vFwd) * (180 + rpmNorm * 420)
      : 0;

  const brakeSign = Math.abs(vFwd) > 0.15 ? -Math.sign(vFwd) : 0;
  const totalLongN =
    frontDriveN +
    rearDriveN +
    brakeSign * brakeTotalN -
    aeroDragN -
    rollingDragN -
    engineBrakingN;

  // Projetando a componente lateral da roda dianteira esterçada
  const totalLatN = latForceFrontN * Math.cos(state.steerAngle) + latForceRearN;

  // Torque de guinada (Yaw Moment)
  // Em carro MR a inércia de guinada é menor (massa concentrada no centro -> gira mais rápido)
  const yawInertiaScale = specs.drivetrain === 'MR' ? 0.84 : specs.drivetrain === '4WD' ? 1.08 : 1.0;
  const izz = specs.massKg * specs.wheelbaseM * specs.wheelbaseM * 0.24 * yawInertiaScale;
  const yawMoment =
    latForceFrontN * Math.cos(state.steerAngle) * distFront -
    latForceRearN * distRear -
    state.yawRate * PHYSICS_TUNING.yawDamping * specs.massKg * 0.42;

  // 9. Integração das Acelerações Locais -> Mundo
  const axLocal = totalLongN / specs.massKg;
  const ayLocal = totalLatN / specs.massKg;

  let nextVFwd = vFwd + (axLocal + state.yawRate * vLeft) * dt;
  let nextVLeft = vLeft + (ayLocal - state.yawRate * vFwd) * dt;
  let nextYawRate = state.yawRate + (yawMoment / izz) * dt;

  // Parada limpa quando muito devagar e freando ou sem acelerador
  if (Math.abs(nextVFwd) < 0.18 && Math.abs(driveForceN) < 80 && (effBrake > 0.1 || effThrottle < 0.05)) {
    nextVFwd = 0;
    nextVLeft *= 0.6;
    nextYawRate *= 0.5;
  }
  if (Math.abs(nextVFwd) < 0.6 && Math.abs(input.steer) < 0.05) {
    nextVLeft *= Math.exp(-8 * dt);
    nextYawRate *= Math.exp(-8 * dt);
  }

  // Limite eletrônico de velocidade máxima (ex: 133 km/h no Dolphin Mini, 180 km/h no BYD Seal) e segurança numérica
  const forwardCapMs = specs.isElectric ? maxSpeedMs : 98;
  nextVFwd = Math.max(-24, Math.min(forwardCapMs, nextVFwd));
  nextVLeft = Math.max(-35, Math.min(35, nextVLeft));
  nextYawRate = Math.max(-3.6, Math.min(3.6, nextYawRate));

  state.heading += nextYawRate * dt;
  const nSin = Math.sin(state.heading);
  const nCos = Math.cos(state.heading);

  state.vx = nextVFwd * nSin + nextVLeft * nCos;
  state.vz = nextVFwd * nCos - nextVLeft * nSin;
  state.localVx = nextVLeft;
  state.localVz = nextVFwd;
  state.yawRate = nextYawRate;

  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // 10. Colisão Suave com Barreiras (Guardrails) da Pista
  let wallImpact = 0;
  let wallSideSign = 0;
  if (trackProj) {
    const barrierLimit = trackProj.halfWidth + 4.8;
    const absLat = Math.abs(trackProj.lateralOffset);
    if (absLat > barrierLimit) {
      const sign = Math.sign(trackProj.lateralOffset);
      wallSideSign = sign;
      const excess = absLat - barrierLimit;
      // Empurra suavemente de volta para dentro da barreira
      state.x -= trackProj.nx * sign * excess;
      state.z -= trackProj.nz * sign * excess;

      // Velocidade entrando na barreira (ou raspagem lateral em alta velocidade)
      const vIntoWall = (state.vx * trackProj.nx + state.vz * trackProj.nz) * sign;
      if (vIntoWall > 0) {
        wallImpact = Math.min(1, vIntoWall / 16);
        // Remove componente normal com leve rebote e fricção lateral
        state.vx -= trackProj.nx * sign * vIntoWall * 1.32;
        state.vz -= trackProj.nz * sign * vIntoWall * 1.32;
        state.vx *= 0.86;
        state.vz *= 0.86;
        state.yawRate *= 0.5;
      } else if (speedMs > 8) {
        wallImpact = Math.max(wallImpact, Math.min(0.28, speedMs / 85));
      }
    }
    state.y = trackProj.heightY;
  }

  // 11. Telemetria, Forças G, Inclinação da Carroceria (Pitch/Roll) e Escorregamento dos Pneus
  const smoothG = 1 - Math.exp(-10 * dt);
  state.longG += (axLocal / g - state.longG) * smoothG;
  state.latG += (ayLocal / g - state.latG) * smoothG;

  // Inclinação visual (pitch ao frear/acelerar, roll nas curvas) escalada pela rigidez da suspensão
  const targetPitch = Math.max(-0.06, Math.min(0.06, (-state.longG * 0.032) / specs.pitchStiffness));
  const targetRoll = Math.max(-0.085, Math.min(0.085, (state.latG * 0.048) / specs.rollStiffness));
  const suspSmooth = 1 - Math.exp(-12 * dt);
  state.pitchRad += (targetPitch - state.pitchRad) * suspSmooth;
  state.rollRad += (targetRoll - state.rollRad) * suspSmooth;

  state.speedKmh = Math.hypot(state.vx, state.vz) * 3.6;
  state.wheelSpinRad += (nextVFwd / PHYSICS_TUNING.wheelRadiusM) * dt;

  const frontSlipNorm = Math.min(
    1.5,
    Math.abs(frontSlipAngle) / 0.24 + frontWheelSpinSlip + frontBrakeLock * 0.7,
  );
  const rearSlipNorm = Math.min(
    1.5,
    Math.abs(rearSlipAngle) / 0.22 + rearWheelSpinSlip + rearBrakeLock * 0.8,
  );
  state.frontSlip = frontSlipNorm;
  state.rearSlip = rearSlipNorm;

  const maxSlip = Math.max(frontSlipNorm, rearSlipNorm);
  const targetScreech =
    onTrack && speedMs > 4.5 && maxSlip > 0.42
      ? Math.min(1, (maxSlip - 0.42) * 1.35)
      : 0;
  state.tireScreech += (targetScreech - state.tireScreech) * (1 - Math.exp(-14 * dt));

  return { wallImpact, wallSideSign, shiftedUp };
}
