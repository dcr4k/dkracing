/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GTModeHub } from './components/GTModeHub';
import { LandscapeGuard } from './components/LandscapeGuard';
import { RaceHUD } from './components/RaceHUD';
import { RaceModal } from './components/RaceModal';
import { TitleScreen } from './components/TitleScreen';
import { GyroPermissionState } from './components/TouchControls';
import { isGlbLoading, subscribeGlbLoading } from './game/carMesh';
import { DEFAULT_TUNING, getCarById, getLicenseById, getTrackMetaById } from './game/catalog';
import {
  TuningCategory,
  buyCar,
  buyOrEquipPaint,
  buyOrEquipRim,
  buyOrToggleGtWing,
  buyTuningUpgrade,
  createInitialSaveState,
  getCarTuning,
  getCarVisualConfig,
  loadSaveState,
  persistSaveState,
  recordLicenseResult,
  recordRaceResult,
  selectCar,
  setCarPaintFinish,
  updateAssists,
} from './game/progression';
import { RacingSceneEngine, TouchControlState } from './game/sceneEngine';
import { getTrackById, TrackData } from './game/trackMath';
import { useFullscreenLandscape } from './game/useFullscreenLandscape';
import { useViewportLayout } from './game/useViewportLayout';
import {
  AppScreen,
  AssistSettings,
  CameraMode,
  HudTelemetry,
  LicenseTestId,
  PaintFinish,
  RaceMode,
  RimStyle,
  SaveState,
  SessionConfig,
  SessionResult,
  SteeringMode,
  TimeOfDay,
  TrackId,
} from './game/types';

interface DeviceOrientationEventiOS extends DeviceOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function getInitialGyroState(): GyroPermissionState {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return 'unsupported';
  }
  const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventiOS;
  if (typeof ctor?.requestPermission === 'function') {
    return 'prompt';
  }
  return 'granted';
}

const INITIAL_TELEMETRY: HudTelemetry = {
  speedKmh: 0,
  rpm: 950,
  redlineRpm: 8400,
  gear: 1,
  throttle: 0,
  brake: 0,
  longG: 0,
  latG: 0,
  frontSlip: 0,
  rearSlip: 0,
  absActive: false,
  tcsActive: false,
  shiftLight: false,
  lap: 1,
  totalLaps: 3,
  position: 1,
  totalCars: 4,
  currentLapTime: 0,
  bestLapTime: null,
  totalTime: 0,
  countdown: 0,
  cameraMode: 'chase',
  dots: [],
  licenseProgressM: 0,
  licenseTargetM: 0,
  wrongWay: false,
};

export default function App() {
  const layout = useViewportLayout();
  const { isFullscreen, enterFullscreenLandscape, toggleFullscreen } = useFullscreenLandscape();

  const [save, setSave] = useState<SaveState>(() => loadSaveState());
  const [screen, setScreen] = useState<AppScreen>('title');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<HudTelemetry>(INITIAL_TELEMETRY);
  const [activeTrack, setActiveTrack] = useState<TrackData>(() => getTrackById('grand_prix'));
  const [activeSession, setActiveSession] = useState<SessionConfig | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [touchModePreference, setTouchModePreference] = useState<'auto' | 'on' | 'off'>('auto');
  const [gyroPermissionState, setGyroPermissionState] = useState<GyroPermissionState>(() =>
    getInitialGyroState(),
  );
  const [portraitBypassed, setPortraitBypassed] = useState<boolean>(false);
  const [isGlbDownloading, setIsGlbDownloading] = useState<boolean>(() => isGlbLoading());

  const showTouchControls =
    touchModePreference === 'on'
      ? true
      : touchModePreference === 'off'
        ? false
        : layout.isMobileViewport;

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingSceneEngine | null>(null);
  const screenRef = useRef<AppScreen>(screen);
  const saveRef = useRef<SaveState>(save);

  screenRef.current = screen;
  saveRef.current = save;

  useEffect(() => {
    return subscribeGlbLoading((loading) => {
      setIsGlbDownloading(loading);
    });
  }, []);

  useEffect(() => {
    if (!layout.isPortrait && portraitBypassed) {
      setPortraitBypassed(false);
    }
  }, [layout.isPortrait, portraitBypassed]);

  useEffect(() => {
    persistSaveState(save);
    engineRef.current?.audio.setMuted(save.muted);
  }, [save]);

  useEffect(() => {
    const bodyState =
      screen === 'title'
        ? 'title'
        : screen === 'playing'
          ? 'playing'
          : screen === 'paused'
            ? 'paused'
            : screen === 'result'
              ? 'gameover'
              : 'menu';
    document.body.dataset.state = bodyState;
  }, [screen]);

  const showToast = useCallback((msg: string) => {
    setFeedbackMsg(msg);
    window.setTimeout(() => {
      setFeedbackMsg((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  const handleToggleMute = useCallback(() => {
    setSave((prev) => ({ ...prev, muted: !prev.muted }));
  }, []);

  const handleRequestGyroPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setGyroPermissionState('unsupported');
      showToast('Giroscópio indisponível neste dispositivo.');
      return;
    }
    const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventiOS;
    if (typeof ctor?.requestPermission === 'function') {
      try {
        const res = await ctor.requestPermission();
        if (res === 'granted') {
          setGyroPermissionState('granted');
          showToast('Giroscópio ativado!');
        } else {
          setGyroPermissionState('denied');
          showToast('Permissão de giroscópio negada.');
        }
      } catch {
        setGyroPermissionState('denied');
        showToast('Não foi possível solicitar permissão do sensor.');
      }
    } else {
      setGyroPermissionState('granted');
      showToast('Giroscópio pronto para uso!');
    }
  }, [showToast]);

  const handlePauseToggle = useCallback(() => {
    const current = screenRef.current;
    if (current === 'playing') {
      engineRef.current?.setPaused(true);
      setScreen('paused');
    } else if (current === 'paused') {
      engineRef.current?.setPaused(false);
      setScreen('playing');
    }
  }, []);

  const handleSessionFinish = useCallback((rawResult: SessionResult) => {
    if (rawResult.mode === 'license' && rawResult.licenseId) {
      const outcome = recordLicenseResult(
        saveRef.current,
        rawResult.licenseId,
        rawResult.totalTime,
        rawResult.success,
      );
      setSave(outcome.state);
      setSessionResult({
        ...rawResult,
        medal: outcome.medal,
        creditsEarned: outcome.creditsEarned,
        success: outcome.medal !== 'none',
        failReason:
          rawResult.failReason ??
          (outcome.medal === 'none'
            ? 'Tempo acima do limite de Bronze. Tente manter mais velocidade!'
            : undefined),
      });
    } else {
      const outcome = recordRaceResult(
        saveRef.current,
        rawResult.position ?? 1,
        rawResult.bestLapTime,
        rawResult.mode === 'time_trial' || rawResult.mode === 'drift',
      );
      setSave(outcome.state);
      setSessionResult({
        ...rawResult,
        creditsEarned: outcome.creditsEarned,
      });
    }
    setScreen('result');
  }, []);

  // Mount WebGLRenderer once in isolated sibling container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new RacingSceneEngine(mount, {
      onTelemetry: (data) => setTelemetry(data),
      onSessionFinish: handleSessionFinish,
      onPauseToggle: handlePauseToggle,
      onCameraChange: () => {},
      onMuteToggle: handleToggleMute,
    });
    const cur = saveRef.current;
    engine.audio.setMuted(cur.muted);
    engine.enterShowcaseMode(
      cur.selectedCarId,
      getCarVisualConfig(cur, cur.selectedCarId),
      'center',
      cur.selectedTrackId,
      cur.selectedTimeOfDay,
    );
    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const cfg: SessionConfig = {
        mode: 'race',
        carId: cur.selectedCarId,
        trackId: cur.selectedTrackId,
        timeOfDay: cur.selectedTimeOfDay,
        visual: getCarVisualConfig(cur, cur.selectedCarId),
        tuning: getCarTuning(cur, cur.selectedCarId),
        assists: cur.assists,
        defaultCamera: cur.defaultCamera,
        totalLaps: 3,
      };
      setActiveSession(cfg);
      engine.startSession(cfg);
      setActiveTrack(engine.getTrackData());
      setScreen('playing');
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [handlePauseToggle, handleSessionFinish, handleToggleMute]);

  const launchSession = useCallback((cfg: SessionConfig) => {
    setSessionResult(null);
    setActiveSession(cfg);
    if (engineRef.current) {
      engineRef.current.audio.playUiClick(1.1);
      engineRef.current.startSession(cfg);
      setActiveTrack(engineRef.current.getTrackData());
    }
    setScreen('playing');
  }, []);

  const handleStartRace = useCallback(
    (mode: Extract<RaceMode, 'race' | 'time_trial' | 'drift'>, totalLaps: number) => {
      launchSession({
        mode,
        carId: save.selectedCarId,
        trackId: save.selectedTrackId,
        timeOfDay: save.selectedTimeOfDay,
        visual: getCarVisualConfig(save, save.selectedCarId),
        tuning: getCarTuning(save, save.selectedCarId),
        assists: mode === 'drift' ? { ...save.assists, tcs: false } : save.assists,
        defaultCamera: save.defaultCamera,
        totalLaps,
      });
    },
    [launchSession, save],
  );

  const handleStartLicense = useCallback(
    (licenseId: LicenseTestId) => {
      const def = getLicenseById(licenseId);
      const licCar = getCarById(def.carId);
      launchSession({
        mode: 'license',
        carId: def.carId,
        trackId: 'grand_prix',
        timeOfDay: 'day',
        visual: {
          paintFinish: 'metallic',
          rimStyle: 'stock_5spoke',
          gtWing: false,
          rideHeightDropM: 0,
          glbUrl: licCar.glbUrl,
        },
        tuning: { ...DEFAULT_TUNING },
        assists: save.assists,
        defaultCamera: save.defaultCamera,
        licenseId,
        totalLaps: 1,
      });
    },
    [launchSession, save.assists, save.defaultCamera],
  );

  const handleNavigate = useCallback((next: AppScreen, previewCarId?: string) => {
    engineRef.current?.audio.playUiClick();
    const cur = saveRef.current;
    if (next === 'title') {
      const carId = previewCarId ?? cur.selectedCarId;
      engineRef.current?.enterShowcaseMode(
        carId,
        getCarVisualConfig(cur, carId),
        'center',
        cur.selectedTrackId,
        cur.selectedTimeOfDay,
      );
    } else if (next === 'garage' || next === 'dealership' || next === 'tuning') {
      const carId = previewCarId ?? cur.selectedCarId;
      engineRef.current?.enterShowcaseMode(
        carId,
        getCarVisualConfig(cur, carId),
        'right',
        cur.selectedTrackId,
        cur.selectedTimeOfDay,
      );
    }
    setScreen(next);
  }, []);

  const handlePreviewCar = useCallback((carId: string) => {
    const cur = saveRef.current;
    engineRef.current?.setShowcaseCar(
      carId,
      getCarVisualConfig(cur, carId),
      'right',
      cur.selectedTrackId,
      cur.selectedTimeOfDay,
    );
  }, []);

  const handleBuyCar = useCallback(
    (carId: string) => {
      const res = buyCar(save, carId);
      if (res.ok) {
        engineRef.current?.audio.playPurchaseChime();
        setSave(res.state);
        engineRef.current?.setShowcaseCar(
          carId,
          getCarVisualConfig(res.state, carId),
          'right',
          res.state.selectedTrackId,
          res.state.selectedTimeOfDay,
        );
      } else {
        engineRef.current?.audio.playUiClick(0.7);
      }
      showToast(res.message);
    },
    [save, showToast],
  );

  const handleSelectCar = useCallback(
    (carId: string) => {
      engineRef.current?.audio.playUiClick(1.15);
      const next = selectCar(saveRef.current, carId);
      setSave(next);
      engineRef.current?.setShowcaseCar(
        carId,
        getCarVisualConfig(next, carId),
        'right',
        next.selectedTrackId,
        next.selectedTimeOfDay,
      );
      showToast('Veículo equipado na garagem!');
    },
    [showToast],
  );

  const handleBuyUpgrade = useCallback(
    (carId: string, category: TuningCategory, stage: number) => {
      const res = buyTuningUpgrade(save, carId, category, stage);
      if (res.ok) {
        engineRef.current?.audio.playPurchaseChime();
        setSave(res.state);
        // Immediate 3D update (e.g. suspension lowering in real-time!)
        engineRef.current?.setShowcaseCar(carId, getCarVisualConfig(res.state, carId), 'right');
      } else {
        engineRef.current?.audio.playUiClick(0.7);
      }
      showToast(res.message);
    },
    [save, showToast],
  );

  const handleBuyOrEquipPaint = useCallback(
    (carId: string, paintId: string) => {
      const res = buyOrEquipPaint(save, carId, paintId);
      if (res.ok) {
        engineRef.current?.audio.playPurchaseChime();
        setSave(res.state);
        engineRef.current?.setShowcaseCar(carId, getCarVisualConfig(res.state, carId), 'right');
      } else {
        engineRef.current?.audio.playUiClick(0.7);
      }
      showToast(res.message);
    },
    [save, showToast],
  );

  const handleSetPaintFinish = useCallback(
    (carId: string, finish: PaintFinish) => {
      engineRef.current?.audio.playUiClick(1.1);
      const next = setCarPaintFinish(saveRef.current, carId, finish);
      setSave(next);
      engineRef.current?.setShowcaseCar(carId, getCarVisualConfig(next, carId), 'right');
      const labels: Record<PaintFinish, string> = {
        metallic: 'Metálico',
        matte: 'Fosco',
        chrome: 'Cromado',
      };
      showToast(`Acabamento ${labels[finish]} aplicado em 3D!`);
    },
    [showToast],
  );

  const handleBuyOrEquipRim = useCallback(
    (carId: string, rimId: RimStyle) => {
      const res = buyOrEquipRim(save, carId, rimId);
      if (res.ok) {
        engineRef.current?.audio.playPurchaseChime();
        setSave(res.state);
        engineRef.current?.setShowcaseCar(carId, getCarVisualConfig(res.state, carId), 'right');
      } else {
        engineRef.current?.audio.playUiClick(0.7);
      }
      showToast(res.message);
    },
    [save, showToast],
  );

  const handleToggleGtWing = useCallback(
    (carId: string) => {
      const res = buyOrToggleGtWing(save, carId);
      if (res.ok) {
        engineRef.current?.audio.playPurchaseChime();
        setSave(res.state);
        engineRef.current?.setShowcaseCar(carId, getCarVisualConfig(res.state, carId), 'right');
      } else {
        engineRef.current?.audio.playUiClick(0.7);
      }
      showToast(res.message);
    },
    [save, showToast],
  );

  const handleSelectTrack = useCallback((trackId: TrackId) => {
    engineRef.current?.audio.playUiClick(1.08);
    const meta = getTrackMetaById(trackId);
    const prev = saveRef.current;
    const nextTime = trackId === 'night_expressway' ? 'night' : prev.selectedTimeOfDay;
    const next: SaveState = {
      ...prev,
      selectedTrackId: trackId,
      selectedTimeOfDay: nextTime,
    };
    saveRef.current = next;
    setSave(next);
    if (screenRef.current !== 'playing') {
      engineRef.current?.setShowcaseCar(
        next.selectedCarId,
        getCarVisualConfig(next, next.selectedCarId),
        undefined,
        trackId,
        nextTime,
      );
    }
    if (meta.id === 'night_expressway') {
      showToast('Via Expressa Noturna selecionada (Faróis ligados)!');
    }
  }, [showToast]);

  const handleSelectTimeOfDay = useCallback((time: TimeOfDay) => {
    engineRef.current?.audio.playUiClick(1.05);
    const next: SaveState = { ...saveRef.current, selectedTimeOfDay: time };
    saveRef.current = next;
    setSave(next);
    engineRef.current?.setTimeOfDay(time);
  }, []);

  const handleUpdateAssists = useCallback((partial: Partial<AssistSettings>) => {
    engineRef.current?.audio.playUiClick(1.05);
    setSave((prev) => updateAssists(prev, partial));
  }, []);

  const handleUpdateDefaultCamera = useCallback((camera: CameraMode) => {
    engineRef.current?.audio.playUiClick(1.05);
    setSave((prev) => ({ ...prev, defaultCamera: camera }));
  }, []);

  const handleUpdateSteeringMode = useCallback(
    (mode: SteeringMode) => {
      engineRef.current?.audio.playUiClick(1.08);
      setSave((prev) => ({ ...prev, steeringMode: mode }));
      if (mode === 'gyro' && gyroPermissionState === 'prompt') {
        void handleRequestGyroPermission();
      }
    },
    [gyroPermissionState, handleRequestGyroPermission],
  );

  const handleResetCareer = useCallback(() => {
    const fresh = createInitialSaveState();
    setSave(fresh);
    engineRef.current?.enterShowcaseMode(
      fresh.selectedCarId,
      getCarVisualConfig(fresh, fresh.selectedCarId),
      'center',
      fresh.selectedTrackId,
      fresh.selectedTimeOfDay,
    );
    showToast('Carreira reiniciada com 10.000 Cr.!');
  }, [showToast]);

  const handleBackToMenu = useCallback(() => {
    const cur = saveRef.current;
    engineRef.current?.enterShowcaseMode(
      cur.selectedCarId,
      getCarVisualConfig(cur, cur.selectedCarId),
      'center',
      cur.selectedTrackId,
      cur.selectedTimeOfDay,
    );
    setSessionResult(null);
    setScreen('title');
  }, []);

  const handleTouchChange = useCallback((partial: Partial<TouchControlState>) => {
    engineRef.current?.setTouchInput(partial);
  }, []);

  const handleTouchShift = useCallback((dir: 1 | -1) => {
    engineRef.current?.triggerTouchShift(dir);
  }, []);

  const handleToggleHudTouch = useCallback(() => {
    setTouchModePreference((prev) => {
      const currentlyShown = prev === 'on' ? true : prev === 'off' ? false : layout.isMobileViewport;
      return currentlyShown ? 'off' : 'on';
    });
  }, [layout.isMobileViewport]);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-[#dce5f0]">
      {/* Dedicated isolated WebGL canvas mount */}
      <div
        ref={canvasMountRef}
        data-testid="webgl-viewport"
        className="fixed inset-0 z-0 w-full h-full touch-pad"
      />

      {/* Non-blocking 3D GLB Streaming Indicator (Garagem / Loja / Oficina / Pista) */}
      {isGlbDownloading && (
        <div
          data-testid="glb-loading-indicator"
          className="fixed bottom-3 right-3 z-40 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-sky-400/40 text-sky-100 text-[11px] font-bold tracking-wide shadow-lg"
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          <span>Carregando veículo 3D...</span>
        </div>
      )}

      {/* Horizontal-First Main Lobby */}
      {screen === 'title' && (
        <TitleScreen
          save={save}
          layout={layout}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onToggleMute={handleToggleMute}
          onNavigate={handleNavigate}
          onQuickRace={() => handleStartRace('race', 3)}
        />
      )}

      {/* Menus: Modos (3 Pistas + 3 Horários), Garagem, Loja, Oficina 3D, Licenças, Configurações */}
      {(screen === 'gt_home' ||
        screen === 'garage' ||
        screen === 'dealership' ||
        screen === 'tuning' ||
        screen === 'license' ||
        screen === 'race_setup' ||
        screen === 'settings') && (
        <GTModeHub
          screen={screen}
          save={save}
          layout={layout}
          isFullscreen={isFullscreen}
          showTouchControls={showTouchControls}
          touchModePreference={touchModePreference}
          gyroPermissionState={gyroPermissionState}
          feedbackMsg={feedbackMsg}
          onNavigate={handleNavigate}
          onPreviewCar={handlePreviewCar}
          onSelectCar={handleSelectCar}
          onBuyCar={handleBuyCar}
          onBuyUpgrade={handleBuyUpgrade}
          onBuyOrEquipPaint={handleBuyOrEquipPaint}
          onSetPaintFinish={handleSetPaintFinish}
          onBuyOrEquipRim={handleBuyOrEquipRim}
          onToggleGtWing={handleToggleGtWing}
          onSelectTrack={handleSelectTrack}
          onSelectTimeOfDay={handleSelectTimeOfDay}
          onStartLicense={handleStartLicense}
          onStartRace={handleStartRace}
          onUpdateAssists={handleUpdateAssists}
          onUpdateDefaultCamera={handleUpdateDefaultCamera}
          onUpdateSteeringMode={handleUpdateSteeringMode}
          onRequestGyroPermission={() => {
            void handleRequestGyroPermission();
          }}
          onUpdateTouchPreference={setTouchModePreference}
          onResetCareer={handleResetCareer}
          onToggleFullscreen={toggleFullscreen}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Active Driving HUD */}
      {(screen === 'playing' || screen === 'paused' || screen === 'result') && activeSession && (
        <RaceHUD
          telemetry={telemetry}
          track={activeTrack}
          mode={activeSession.mode}
          licenseId={activeSession.licenseId}
          assists={activeSession.assists}
          steeringMode={save.steeringMode}
          gyroPermissionState={gyroPermissionState}
          muted={save.muted}
          isFullscreen={isFullscreen}
          layout={layout}
          showTouchControls={showTouchControls}
          onRequestGyroPermission={() => {
            void handleRequestGyroPermission();
          }}
          onToggleFullscreen={toggleFullscreen}
          onToggleTouchControls={handleToggleHudTouch}
          onTouchChange={handleTouchChange}
          onTouchShift={handleTouchShift}
          onCycleCamera={() => engineRef.current?.cycleCameraMode()}
          onToggleMute={handleToggleMute}
          onPause={handlePauseToggle}
          onRestart={() => launchSession(activeSession)}
        />
      )}

      {/* Pause & Result Modals */}
      {screen === 'paused' && (
        <RaceModal
          kind="paused"
          onResume={handlePauseToggle}
          onRestart={() => activeSession && launchSession(activeSession)}
          onBackToMenu={handleBackToMenu}
        />
      )}

      {screen === 'result' && (
        <RaceModal
          kind="result"
          result={sessionResult}
          onResume={() => {}}
          onRestart={() => activeSession && launchSession(activeSession)}
          onBackToMenu={handleBackToMenu}
        />
      )}

      {/* Force Horizontal Orientation on Vertical Phones */}
      {layout.isPortrait && !portraitBypassed && (
        <LandscapeGuard
          onEnterFullscreenLandscape={() => {
            void enterFullscreenLandscape();
          }}
          onDismissForPreview={() => setPortraitBypassed(true)}
        />
      )}
    </div>
  );
}
