import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARS,
  DEFAULT_CAR_ID,
  DEFAULT_PLAYER_GLB_URL,
  PAINT_ITEMS,
  RIM_OPTIONS,
  STARTING_CREDITS,
  TRACKS,
  getCarById,
} from './catalog';
import {
  buyOrEquipPaint,
  buyOrEquipRim,
  buyOrToggleGtWing,
  buyTuningUpgrade,
  computeEffectiveSpecs,
  createInitialSaveState,
  evaluateLicenseMedal,
  getCarPaintHex,
  getCarVisualConfig,
  recordLicenseResult,
  recordRaceResult,
  setCarPaintFinish,
} from './progression';
import { getTrackById } from './trackMath';

test('initial career starts with both 2K GLB EV cars (BYD Dolphin Mini & BYD Seal) and all equipment unlocked', () => {
  const state = createInitialSaveState();
  assert.equal(CARS.length, 2);
  assert.equal(state.credits, STARTING_CREDITS);
  assert.equal(state.selectedCarId, DEFAULT_CAR_ID);
  assert.deepEqual(state.ownedCarIds, ['byd_dolphin_mini', 'byd_seal']);
  assert.equal(state.ownedPaintIds.length, PAINT_ITEMS.length);
  assert.equal(state.ownedRimStyles.length, RIM_OPTIONS.length);
  assert.ok(state.ownedGtWingCars.includes('byd_dolphin_mini'));
  assert.ok(state.ownedGtWingCars.includes('byd_seal'));
  assert.deepEqual(state.ownedTiresByCar['byd_dolphin_mini'], [0, 1, 2, 3]);
  assert.deepEqual(state.ownedTiresByCar['byd_seal'], [0, 1, 2, 3]);
});

test('all tuning upgrades are free (0 Cr.) and can be freely switched up and down for testing', () => {
  const state = createInitialSaveState();
  const car = getCarById(DEFAULT_CAR_ID);
  const before = computeEffectiveSpecs(car, state.tuningByCar[DEFAULT_CAR_ID]);

  // Equip Stage 3 Engine for 0 Cr., then freely switch down to Stage 1 or Stage 0
  const r1 = buyTuningUpgrade(state, DEFAULT_CAR_ID, 'engineStage', 3);
  assert.equal(r1.ok, true);
  assert.equal(r1.state.credits, state.credits, 'Equipment must cost 0 Cr. during test mode');
  assert.equal(r1.state.tuningByCar[DEFAULT_CAR_ID].engineStage, 3);

  const rDown = buyTuningUpgrade(r1.state, DEFAULT_CAR_ID, 'engineStage', 1);
  assert.equal(rDown.ok, true);
  assert.equal(rDown.state.tuningByCar[DEFAULT_CAR_ID].engineStage, 1);

  // Swap freely between Drift tires (Stage 3) and Sport tires (Stage 1)
  const rDrift = buyTuningUpgrade(rDown.state, DEFAULT_CAR_ID, 'tireStage', 3);
  assert.equal(rDrift.ok, true);
  const driftSpecs = computeEffectiveSpecs(car, rDrift.state.tuningByCar[DEFAULT_CAR_ID]);
  assert.equal(driftSpecs.isDriftTire, true);
  assert.ok(driftSpecs.rearLateralBias < 0.85, 'Drift tires must reduce rear lateral grip bias');

  const rSport = buyTuningUpgrade(rDrift.state, DEFAULT_CAR_ID, 'tireStage', 1);
  assert.equal(rSport.ok, true);

  // Equip Stage 3 Suspension (-90mm) and verify visual ride height drop, then test switching back to Stage 0
  const rSusp = buyTuningUpgrade(rSport.state, DEFAULT_CAR_ID, 'chassisStage', 3);
  assert.equal(rSusp.ok, true);
  const after = computeEffectiveSpecs(car, rSusp.state.tuningByCar[DEFAULT_CAR_ID]);
  assert.ok(after.hp > before.hp, 'Engine upgrade boosts HP');
  assert.equal(after.isElectric, true, 'BYD vehicles are marked as electric');
  assert.ok(after.tireGripMu > before.tireGripMu, 'Sport tires increase lateral friction mu');
  assert.ok(after.rideHeightDropM >= 0.08, 'Stage 3 suspension visibly lowers ride height');

  const rSuspStock = buyTuningUpgrade(rSusp.state, DEFAULT_CAR_ID, 'chassisStage', 0);
  assert.equal(rSuspStock.ok, true);
  assert.equal(rSuspStock.state.tuningByCar[DEFAULT_CAR_ID].chassisStage, 0);
});

test('license medals award one-time tier credits accurately', () => {
  const initial = createInitialSaveState();

  assert.equal(evaluateLicenseMedal('B-1', 15.8, true), 'gold');
  assert.equal(evaluateLicenseMedal('B-1', 17.5, true), 'silver');
  assert.equal(evaluateLicenseMedal('B-1', 20.1, true), 'bronze');
  assert.equal(evaluateLicenseMedal('B-1', 14.0, false), 'none');

  const first = recordLicenseResult(initial, 'B-1', 17.5, true);
  assert.equal(first.medal, 'silver');
  assert.equal(first.creditsEarned, 1200 + 2400);
  assert.equal(first.state.credits, 13600);

  const repeat = recordLicenseResult(first.state, 'B-1', 17.2, true);
  assert.equal(repeat.creditsEarned, 0);
  assert.equal(repeat.state.licenseRecords['B-1'].bestTime, 17.2);

  const gold = recordLicenseResult(repeat.state, 'B-1', 15.9, true);
  assert.equal(gold.medal, 'gold');
  assert.equal(gold.creditsEarned, 4500);
  assert.equal(gold.state.licenseRecords['B-1'].medal, 'gold');
});

test('race finish records best lap, win count, and credit payout', () => {
  const initial = createInitialSaveState();
  const win = recordRaceResult(initial, 1, 54.321, false);
  assert.equal(win.creditsEarned, 6000);
  assert.equal(win.state.racesWon, 1);
  assert.equal(win.state.bestCircuitLapSec, 54.321);
});

test('visual customization (PBR finish, 4 rim styles, GT Wing, paint) is free and targets the 2K GLB models', () => {
  assert.equal(CARS.length, 2);
  assert.equal(TRACKS.length, 3);
  for (const t of TRACKS) {
    const data = getTrackById(t.id);
    assert.ok(data.samples.length > 100);
    assert.equal(data.closed, true);
  }

  let state = createInitialSaveState();
  assert.equal(getCarPaintHex(state, DEFAULT_CAR_ID), undefined);

  const bought = buyOrEquipPaint(state, DEFAULT_CAR_ID, 'bayside_blue');
  assert.equal(bought.ok, true);
  assert.equal(bought.state.credits, state.credits);
  state = setCarPaintFinish(bought.state, DEFAULT_CAR_ID, 'chrome');

  const rimRes = buyOrEquipRim(state, DEFAULT_CAR_ID, 'deep_dish');
  assert.equal(rimRes.ok, true);
  assert.equal(rimRes.state.credits, state.credits);
  state = rimRes.state;

  const wingRes = buyOrToggleGtWing(state, DEFAULT_CAR_ID);
  assert.equal(wingRes.ok, true);
  assert.equal(wingRes.state.credits, state.credits);
  state = wingRes.state;

  const visual = getCarVisualConfig(state, DEFAULT_CAR_ID);
  assert.equal(visual.paintHex, '#1d4ed8');
  assert.equal(visual.paintFinish, 'chrome');
  assert.equal(visual.rimStyle, 'deep_dish');
  assert.equal(visual.gtWing, true);
  assert.equal(visual.glbUrl, DEFAULT_PLAYER_GLB_URL);

  const toggleOff = buyOrToggleGtWing(state, DEFAULT_CAR_ID);
  assert.equal(toggleOff.ok, true);
  assert.equal(getCarVisualConfig(toggleOff.state, DEFAULT_CAR_ID).gtWing, false);
});
