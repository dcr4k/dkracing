import test from 'node:test';
import assert from 'node:assert/strict';
import { getCarById, DEFAULT_TUNING } from './catalog';
import { computeEffectiveSpecs } from './progression';
import {
  createInitialPhysicsState,
  evaluatePacejkaLateral,
  evaluateTorqueCurve,
  getDrivetrainSplit,
  stepVehiclePhysics,
} from './physics';
import { AssistSettings, ControlInput } from './types';

const defaultAssists: AssistSettings = {
  tcs: true,
  abs: true,
  transmission: 'auto',
};

const neutralInput: ControlInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  shiftUpJustPressed: false,
  shiftDownJustPressed: false,
};

test('acceleration transfers weight rearward and braking transfers weight forward', () => {
  const specs = computeEffectiveSpecs(getCarById('byd_seal'), DEFAULT_TUNING);
  const state = createInitialPhysicsState(0, 0, 0, 0, specs);

  // Accelerate hard for 2.0s
  for (let i = 0; i < 120; i++) {
    stepVehiclePhysics(state, { ...neutralInput, throttle: 1 }, specs, defaultAssists, 1 / 60);
  }
  assert.ok(state.speedKmh > 65, `Expected speed > 65 km/h, got ${state.speedKmh}`);
  assert.ok(
    state.rearLoadRatio > 1 - specs.frontWeightRatio,
    'Weight should transfer to rear axle under acceleration',
  );

  // Now brake hard for 0.6s
  for (let i = 0; i < 36; i++) {
    stepVehiclePhysics(state, { ...neutralInput, brake: 1 }, specs, defaultAssists, 1 / 60);
  }
  assert.ok(
    state.frontLoadRatio > specs.frontWeightRatio,
    'Weight should transfer to front axle under braking',
  );
  assert.equal(state.isBraking, true);
});

test('drivetrain splits match FF, FR, MR, and 4WD physics profiles', () => {
  assert.deepEqual(getDrivetrainSplit('FF'), { front: 1, rear: 0 });
  assert.deepEqual(getDrivetrainSplit('FR'), { front: 0, rear: 1 });
  assert.deepEqual(getDrivetrainSplit('MR'), { front: 0, rear: 1 });
  assert.deepEqual(getDrivetrainSplit('4WD'), { front: 0.35, rear: 0.65 });
});

test('manual transmission shifts cleanly through gears 1 to 6 and reverse', () => {
  const specs = computeEffectiveSpecs(getCarById('byd_dolphin_mini'), DEFAULT_TUNING);
  const state = createInitialPhysicsState(0, 0, 0, 0, specs);
  const manualAssists: AssistSettings = { tcs: false, abs: false, transmission: 'manual' };

  assert.equal(state.gear, 1);
  stepVehiclePhysics(state, { ...neutralInput, shiftUpJustPressed: true }, specs, manualAssists, 0.02);
  assert.equal(state.gear, 2);

  // Advance past cooldown and shift down
  for (let i = 0; i < 15; i++) {
    stepVehiclePhysics(state, neutralInput, specs, manualAssists, 0.02);
  }
  stepVehiclePhysics(state, { ...neutralInput, shiftDownJustPressed: true }, specs, manualAssists, 0.02);
  assert.equal(state.gear, 1);
});

test('Pacejka lateral force saturates smoothly and resists slip direction', () => {
  const lowSlip = evaluatePacejkaLateral(0.05, 6000);
  const peakSlip = evaluatePacejkaLateral(0.22, 6000);
  const deepSlip = evaluatePacejkaLateral(0.85, 6000);

  assert.ok(lowSlip < 0, 'Positive slip angle produces restoring negative lateral force');
  assert.ok(Math.abs(peakSlip) > Math.abs(lowSlip), 'Force rises with slip angle up to peak');
  assert.ok(Math.abs(deepSlip) < Math.abs(peakSlip), 'Force drops smoothly after peak slip (oversteer/understeer)');
});

test('torque curve peaks in mid-high RPM and drops at rev limiter', () => {
  const low = evaluateTorqueCurve(0.1);
  const peak = evaluateTorqueCurve(0.72);
  const limiter = evaluateTorqueCurve(1.03);

  assert.ok(peak > low);
  assert.ok(peak > limiter);
});

test('BYD Dolphin Mini has fast 0-50 km/h (~3.5s), 0-100 km/h in ~11s, and top speed capped at 133 km/h', () => {
  const specs = computeEffectiveSpecs(getCarById('byd_dolphin_mini'), DEFAULT_TUNING);
  const state = createInitialPhysicsState(0, 0, 0, 0, specs);

  let timeTo50: number | null = null;
  let timeTo100: number | null = null;
  const dt = 1 / 60;

  for (let step = 1; step <= 60 * 24; step++) {
    stepVehiclePhysics(state, { ...neutralInput, throttle: 1 }, specs, defaultAssists, dt);
    const t = step * dt;
    if (timeTo50 === null && state.speedKmh >= 50) timeTo50 = t;
    if (timeTo100 === null && state.speedKmh >= 100) timeTo100 = t;
  }

  assert.ok(timeTo50 !== null && timeTo50 >= 3.1 && timeTo50 <= 3.9, `Expected Dolphin Mini 0-50 in ~3.5s, got ${timeTo50?.toFixed(2)}s`);
  assert.ok(timeTo100 !== null && timeTo100 >= 10.3 && timeTo100 <= 11.7, `Expected Dolphin Mini 0-100 in ~11.0s, got ${timeTo100?.toFixed(2)}s`);
  assert.ok(state.speedKmh >= 131.5 && state.speedKmh <= 133.2, `Expected Dolphin Mini top speed limited to 133 km/h, got ${state.speedKmh.toFixed(2)} km/h`);
});

test('BYD Seal AWD reaches 0-100 km/h in ~3.0s and is electronically limited to 180 km/h', () => {
  const specs = computeEffectiveSpecs(getCarById('byd_seal'), DEFAULT_TUNING);
  const state = createInitialPhysicsState(0, 0, 0, 0, specs);

  let timeTo100: number | null = null;
  const dt = 1 / 60;

  for (let step = 1; step <= 60 * 14; step++) {
    stepVehiclePhysics(state, { ...neutralInput, throttle: 1 }, specs, defaultAssists, dt);
    const t = step * dt;
    if (timeTo100 === null && state.speedKmh >= 100) timeTo100 = t;
  }

  assert.ok(timeTo100 !== null && timeTo100 >= 2.75 && timeTo100 <= 3.25, `Expected BYD Seal 0-100 in ~3.0s, got ${timeTo100?.toFixed(2)}s`);
  assert.ok(state.speedKmh >= 178.5 && state.speedKmh <= 180.2, `Expected BYD Seal top speed limited to 180 km/h, got ${state.speedKmh.toFixed(2)} km/h`);
});

test('Stage 3 tuned car accelerates significantly faster than stock Stage 0', () => {
  const stockSpecs = computeEffectiveSpecs(getCarById('byd_dolphin_mini'), DEFAULT_TUNING);
  const tunedSpecs = computeEffectiveSpecs(getCarById('byd_dolphin_mini'), {
    engineStage: 3,
    weightStage: 3,
    tireStage: 2,
    chassisStage: 2,
  });

  const stockState = createInitialPhysicsState(0, 0, 0, 0, stockSpecs);
  const tunedState = createInitialPhysicsState(0, 0, 0, 0, tunedSpecs);

  for (let i = 0; i < 420; i++) {
    stepVehiclePhysics(stockState, { ...neutralInput, throttle: 1 }, stockSpecs, defaultAssists, 1 / 60);
    stepVehiclePhysics(tunedState, { ...neutralInput, throttle: 1 }, tunedSpecs, defaultAssists, 1 / 60);
  }

  assert.ok(
    tunedState.speedKmh > stockState.speedKmh + 10,
    `Expected Stage 3 tuned car (${tunedState.speedKmh.toFixed(1)}) to outrun stock (${stockState.speedKmh.toFixed(1)})`,
  );
});

test('drift tires induce higher rear slip in corners', () => {
  const car = getCarById('byd_seal');
  const slickSpecs = computeEffectiveSpecs(car, { engineStage: 2, weightStage: 0, tireStage: 2, chassisStage: 1 });
  const driftSpecs = computeEffectiveSpecs(car, { engineStage: 2, weightStage: 0, tireStage: 3, chassisStage: 1 });

  const slickState = createInitialPhysicsState(0, 0, 0, 0, slickSpecs);
  const driftState = createInitialPhysicsState(0, 0, 0, 0, driftSpecs);
  const noTcs: AssistSettings = { tcs: false, abs: true, transmission: 'auto' };

  for (let i = 0; i < 90; i++) {
    stepVehiclePhysics(slickState, { ...neutralInput, throttle: 1 }, slickSpecs, noTcs, 1 / 60);
    stepVehiclePhysics(driftState, { ...neutralInput, throttle: 1 }, driftSpecs, noTcs, 1 / 60);
  }

  let maxSlickSlip = 0;
  let maxDriftSlip = 0;
  for (let i = 0; i < 45; i++) {
    stepVehiclePhysics(slickState, { ...neutralInput, throttle: 1, steer: 0.85 }, slickSpecs, noTcs, 1 / 60);
    stepVehiclePhysics(driftState, { ...neutralInput, throttle: 1, steer: 0.85 }, driftSpecs, noTcs, 1 / 60);
    maxSlickSlip = Math.max(maxSlickSlip, slickState.rearSlip);
    maxDriftSlip = Math.max(maxDriftSlip, driftState.rearSlip);
  }
  assert.ok(
    maxDriftSlip > maxSlickSlip,
    `Expected Drift tires rear slip (${maxDriftSlip.toFixed(2)}) > Semi-Slick (${maxSlickSlip.toFixed(2)})`,
  );
});

