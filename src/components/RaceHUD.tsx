import React, { useMemo } from 'react';
import { Camera, Gamepad2, Maximize2, Minimize2, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { getLicenseById } from '../game/catalog';
import { formatTime } from '../game/progression';
import { TouchControlState } from '../game/sceneEngine';
import { TrackData } from '../game/trackMath';
import {
  AssistSettings,
  CameraMode,
  HudTelemetry,
  LicenseTestId,
  RaceMode,
  SteeringMode,
} from '../game/types';
import { ViewportLayout } from '../game/useViewportLayout';
import { GyroPermissionState, TouchControls } from './TouchControls';

interface RaceHUDProps {
  telemetry: HudTelemetry;
  track: TrackData;
  mode: RaceMode;
  licenseId?: LicenseTestId;
  assists: AssistSettings;
  steeringMode: SteeringMode;
  gyroPermissionState: GyroPermissionState;
  muted: boolean;
  isFullscreen: boolean;
  layout: ViewportLayout;
  showTouchControls: boolean;
  onRequestGyroPermission: () => void;
  onToggleFullscreen: () => void;
  onToggleTouchControls: () => void;
  onTouchChange: (partial: Partial<TouchControlState>) => void;
  onTouchShift: (dir: 1 | -1) => void;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Traseira',
  bumper: 'Capô',
  cinematic: 'Cinema',
};

export const RaceHUD: React.FC<RaceHUDProps> = ({
  telemetry,
  track,
  mode,
  licenseId,
  assists,
  steeringMode,
  gyroPermissionState,
  muted,
  isFullscreen,
  layout,
  showTouchControls,
  onRequestGyroPermission,
  onToggleFullscreen,
  onToggleTouchControls,
  onTouchChange,
  onTouchShift,
  onCycleCamera,
  onToggleMute,
  onPause,
  onRestart,
}) => {
  const licenseDef = licenseId ? getLicenseById(licenseId) : null;
  const isCompact = layout.isPortrait || layout.isCompactLandscape;

  // Precompute normalized minimap polyline once per track
  const minimap = useMemo(() => {
    const pad = 12;
    const size = 128;
    const { minX, maxX, minZ, maxZ } = track.bounds;
    const spanX = Math.max(20, maxX - minX);
    const spanZ = Math.max(20, maxZ - minZ);
    const scale = (size - pad * 2) / Math.max(spanX, spanZ);
    const offsetX = (size - spanX * scale) * 0.5;
    const offsetZ = (size - spanZ * scale) * 0.5;

    const project = (x: number, z: number) => ({
      px: size - (offsetX + (x - minX) * scale),
      py: size - (offsetZ + (z - minZ) * scale),
    });

    const pts = track.samples
      .filter((_, i) => i % 2 === 0)
      .map((s) => {
        const { px, py } = project(s.x, s.z);
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');

    return { size, pts, project };
  }, [track]);

  // Tachometer arc calculations (sweep from -215 deg to +20 deg)
  const maxGaugeRpm = Math.ceil(telemetry.redlineRpm / 1000) * 1000 + 1000;
  const rpmFrac = Math.max(0, Math.min(1, telemetry.rpm / maxGaugeRpm));
  const redlineFrac = telemetry.redlineRpm / maxGaugeRpm;
  const startAngleDeg = -215;
  const sweepDeg = 235;
  const needleDeg = startAngleDeg + rpmFrac * sweepDeg;

  const gearLabel =
    telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : String(telemetry.gear);

  // G-Force indicator ball (clamped to +-1.5 G inside 22px radius)
  const gBallX = Math.max(-1, Math.min(1, -telemetry.latG / 1.5)) * 22;
  const gBallY = Math.max(-1, Math.min(1, telemetry.longG / 1.5)) * 22;
  const totalG = Math.hypot(telemetry.latG, telemetry.longG);

  const minimapDisplaySize = layout.isCompactLandscape ? 60 : layout.isPortrait ? 68 : 128;

  const renderLicenseObjective = (compact: boolean) => {
    if (mode !== 'license' || !licenseDef) return null;
    return (
      <div
        className={`hud-plate rounded-xl text-center ${
          compact ? 'px-3 py-1.5 w-full max-w-[340px]' : 'px-4 py-2.5 min-w-[260px]'
        }`}
      >
        <div className="flex items-center justify-center gap-2.5 text-[11px] font-mono-num flex-wrap">
          <span className="font-display font-bold text-white">{licenseDef.code}</span>
          <span className="text-amber-400">Ouro {licenseDef.goldTime.toFixed(1)}s</span>
          <span className="text-slate-300">Prata {licenseDef.silverTime.toFixed(1)}s</span>
          <span className="text-orange-400">Bronze {licenseDef.bronzeTime.toFixed(1)}s</span>
        </div>
        {telemetry.licenseStatusText && (
          <div className="text-[11px] font-semibold text-sky-300 mt-0.5 truncate">
            {telemetry.licenseStatusText}
          </div>
        )}
        <div className="relative h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
          {licenseDef.stopZoneStartM && licenseDef.stopZoneEndM && (
            <div
              className="absolute top-0 bottom-0 bg-amber-400/75"
              style={{
                left: `${(licenseDef.stopZoneStartM / (licenseDef.stopZoneEndM + 20)) * 100}%`,
                width: `${((licenseDef.stopZoneEndM - licenseDef.stopZoneStartM) / (licenseDef.stopZoneEndM + 20)) * 100}%`,
              }}
            />
          )}
          <div
            className="absolute top-0 bottom-0 left-0 bg-sky-400"
            style={{
              width: `${Math.min(
                100,
                (telemetry.licenseProgressM /
                  (licenseDef.stopZoneEndM ? licenseDef.stopZoneEndM + 20 : licenseDef.targetDistanceM)) *
                  100,
              )}%`,
            }}
          />
        </div>
      </div>
    );
  };

  const renderCompactCluster = (extraClass = '') => (
    <div className={`hud-plate rounded-xl px-3 py-2 flex items-center gap-3 ${extraClass}`}>
      {/* Compact Brake / Throttle Pips */}
      <div className="flex items-end gap-1 h-10">
        <div className="w-1.5 h-full bg-slate-800 rounded-sm overflow-hidden flex flex-col justify-end">
          <div className="w-full bg-red-500" style={{ height: `${Math.round(telemetry.brake * 100)}%` }} />
        </div>
        <div className="w-1.5 h-full bg-slate-800 rounded-sm overflow-hidden flex flex-col justify-end">
          <div className="w-full bg-sky-400" style={{ height: `${Math.round(telemetry.throttle * 100)}%` }} />
        </div>
      </div>

      {/* Digital Speed */}
      <div className="min-w-[60px] text-right">
        <div className="font-mono-num font-bold text-2xl text-white leading-none tabular-nums">
          {telemetry.speedKmh}
        </div>
        <div className="text-[9px] font-semibold tracking-wider text-slate-400 mt-0.5">KM/H</div>
      </div>

      {/* Gear Indicator */}
      <div className="w-9 h-9 rounded-lg bg-slate-950 border border-sky-400/80 flex items-center justify-center shrink-0">
        <span className="font-display font-bold text-xl text-white leading-none">{gearLabel}</span>
      </div>

      {/* Linear GT4 RPM Bar + Shift Light + Mini Assist Badges */}
      <div className="flex flex-col gap-1 min-w-[92px] sm:min-w-[106px]">
        <div className="flex items-center justify-between text-[9px] font-mono-num">
          <span
            className={`px-1.5 py-0.2 rounded font-display font-bold tracking-wider ${
              telemetry.shiftLight ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500'
            }`}
          >
            SHIFT
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={
                assists.tcs
                  ? telemetry.tcsActive
                    ? 'text-amber-400 font-bold'
                    : 'text-sky-300'
                  : 'text-slate-600'
              }
            >
              TCS
            </span>
            <span
              className={
                assists.abs
                  ? telemetry.absActive
                    ? 'text-red-400 font-bold'
                    : 'text-sky-300'
                  : 'text-slate-600'
              }
            >
              ABS
            </span>
          </div>
        </div>

        <div className="relative h-2.5 w-full bg-slate-800 rounded-sm overflow-hidden">
          <div
            className="absolute top-0 bottom-0 right-0 bg-red-900/60"
            style={{ width: `${Math.max(8, (1 - redlineFrac) * 100)}%` }}
          />
          <div
            className={`h-full transition-[width] duration-75 ${
              rpmFrac >= redlineFrac - 0.04 ? 'bg-red-500' : 'bg-sky-400'
            }`}
            style={{ width: `${Math.round(rpmFrac * 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono-num text-slate-400 leading-none">
          <span>{Math.round(telemetry.rpm / 100) * 100} RPM</span>
          <span>{assists.transmission === 'manual' ? 'MT' : 'AT'}</span>
        </div>
      </div>
    </div>
  );

  const utilBtnClass = isCompact
    ? 'hud-plate w-11 h-11 rounded-lg text-white/90 hover:text-white active:bg-slate-800 flex items-center justify-center cursor-pointer shrink-0'
    : 'hud-plate w-9 h-9 rounded-lg text-white/90 hover:text-white hover:bg-slate-800/90 flex items-center justify-center cursor-pointer shrink-0';

  const renderUtilityButtons = () => (
    <div className="flex items-center gap-1 pointer-events-auto">
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onCycleCamera();
        }}
        aria-label={`Trocar câmera: ${CAMERA_LABELS[telemetry.cameraMode]} (C)`}
        title="Trocar câmera: Traseira / Capô / Cinema (C)"
        className={`hud-plate rounded-lg text-white/95 hover:text-white hover:bg-slate-800/90 flex items-center gap-1.5 font-display font-semibold cursor-pointer shrink-0 ${
          isCompact ? 'h-11 px-2.5 text-[11px]' : 'h-9 px-2.5 text-xs'
        }`}
      >
        <Camera className="w-4 h-4 text-sky-300 shrink-0" />
        <span>{CAMERA_LABELS[telemetry.cameraMode]}</span>
      </button>

      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleTouchControls();
        }}
        aria-label={showTouchControls ? 'Ocultar controles de toque' : 'Mostrar controles de toque'}
        title="Controles de toque"
        className={`${utilBtnClass} ${showTouchControls ? 'border-sky-400/70 text-sky-300' : ''}`}
      >
        <Gamepad2 className="w-4 h-4" />
      </button>

      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleFullscreen();
        }}
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia horizontal'}
        title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia (Horizontal)'}
        className={`${utilBtnClass} ${isFullscreen ? 'border-sky-400/70 text-sky-300' : ''}`}
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onRestart();
        }}
        aria-label="Reiniciar (R)"
        title="Reiniciar (R)"
        className={utilBtnClass}
      >
        <RotateCcw className="w-4 h-4" />
      </button>

      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleMute();
        }}
        aria-label={muted ? 'Ativar áudio (M)' : 'Silenciar áudio (M)'}
        title="Áudio (M)"
        className={utilBtnClass}
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onPause();
        }}
        aria-label="Pausar (Esc)"
        title="Pausar (Esc)"
        className={utilBtnClass}
      >
        <Pause className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div
      className={`fixed inset-0 z-20 pointer-events-none flex flex-col justify-between safe-area-hud ${
        isCompact ? 'p-2.5' : 'p-4 md:p-5'
      }`}
    >
      {/* TOP SECTION */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          {/* TOP-LEFT: Minimap + G-Force */}
          <div className="flex items-start gap-2 shrink-0">
            <div className={`hud-plate rounded-xl flex flex-col items-center ${isCompact ? 'p-1.5' : 'p-2'}`}>
              <svg
                width={minimapDisplaySize}
                height={minimapDisplaySize}
                viewBox={`0 0 ${minimap.size} ${minimap.size}`}
                aria-label="Minimapa do circuito"
              >
                {track.closed ? (
                  <polygon
                    points={minimap.pts}
                    fill="none"
                    stroke="rgba(226,232,240,0.45)"
                    strokeWidth="6"
                    strokeLinejoin="round"
                  />
                ) : (
                  <polyline
                    points={minimap.pts}
                    fill="none"
                    stroke="rgba(226,232,240,0.45)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {telemetry.dots.map((dot, i) => {
                  const { px, py } = minimap.project(dot.x, dot.z);
                  return (
                    <circle
                      key={i}
                      cx={px}
                      cy={py}
                      r={dot.isPlayer ? 5.2 : 3.6}
                      fill={dot.isPlayer ? '#38bdf8' : dot.color}
                      stroke="#0f172a"
                      strokeWidth="1.2"
                    />
                  );
                })}
              </svg>
              {isCompact && (
                <span className="font-mono-num text-[10px] font-bold text-amber-300 leading-none mt-0.5">
                  {totalG.toFixed(1)} G
                </span>
              )}
            </div>

            {/* Full Circular G-Force Meter on Desktop */}
            {!isCompact && (
              <div className="hud-plate rounded-xl p-2.5 flex flex-col items-center w-[84px]">
                <span className="text-[10px] font-semibold tracking-wider text-slate-300 mb-1">
                  FORÇA G
                </span>
                <svg width="56" height="56" viewBox="-28 -28 56 56" aria-label="Indicador de Força G">
                  <circle
                    cx="0"
                    cy="0"
                    r="24"
                    fill="rgba(15,23,42,0.75)"
                    stroke="rgba(255,255,255,0.22)"
                    strokeWidth="1"
                  />
                  <circle cx="0" cy="0" r="12" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                  <line x1="-24" y1="0" x2="24" y2="0" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
                  <line x1="0" y1="-24" x2="0" y2="24" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
                  <circle cx={gBallX} cy={gBallY} r="4.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.2" />
                </svg>
                <span className="font-mono-num text-xs font-bold text-white mt-0.5">
                  {totalG.toFixed(1)} G
                </span>
              </div>
            )}
          </div>

          {/* TOP-CENTER on Desktop & Landscape */}
          {!layout.isPortrait && (
            <div className="flex flex-col items-center gap-1.5 max-w-md mx-auto">
              {renderLicenseObjective(layout.isCompactLandscape)}
              {telemetry.wrongWay && (
                <div className="px-3.5 py-1 rounded-lg bg-red-600/95 text-white font-display font-bold text-xs sm:text-sm tracking-wider shadow-lg">
                  SENTIDO INVERSO
                </div>
              )}
            </div>
          )}

          {/* TOP-RIGHT: Timing Cluster + Utility Buttons */}
          <div
            className={`flex shrink-0 ${
              layout.isCompactLandscape ? 'flex-row items-start gap-2' : 'flex-col items-end gap-1.5'
            }`}
          >
            <div
              className={`hud-plate rounded-xl flex items-center ${
                isCompact ? 'px-2.5 py-1.5 gap-2.5' : 'px-4 py-2.5 gap-5'
              }`}
            >
              {mode === 'race' && (
                <div className={`text-center border-r border-white/15 ${isCompact ? 'pr-2.5' : 'pr-4'}`}>
                  <div className="text-[9px] tracking-wider text-slate-300 font-semibold">POS</div>
                  <div
                    className={`font-display font-bold text-white leading-none tabular-nums ${
                      isCompact ? 'text-lg' : 'text-2xl'
                    }`}
                  >
                    {telemetry.position}
                    <span className="text-[11px] text-slate-400 font-normal">/{telemetry.totalCars}</span>
                  </div>
                </div>
              )}

              {mode !== 'license' && (
                <div className={`text-center border-r border-white/15 ${isCompact ? 'pr-2.5' : 'pr-4'}`}>
                  <div className="text-[9px] tracking-wider text-slate-300 font-semibold">VOLTA</div>
                  <div
                    className={`font-display font-bold text-white leading-none tabular-nums ${
                      isCompact ? 'text-lg' : 'text-2xl'
                    }`}
                  >
                    {telemetry.lap}
                    {mode === 'race' && (
                      <span className="text-[11px] text-slate-400 font-normal">/{telemetry.totalLaps}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="text-right font-mono-num">
                <div className="text-[9px] tracking-wider text-slate-300">
                  {mode === 'license' ? 'TEMPO' : 'ATUAL'}
                </div>
                <div
                  className={`font-bold text-white leading-tight ${
                    isCompact ? 'text-sm' : 'text-base md:text-lg'
                  }`}
                >
                  {formatTime(mode === 'license' ? telemetry.totalTime : telemetry.currentLapTime)}
                </div>
                {mode !== 'license' && !layout.isCompactLandscape && (
                  <div className="text-[10px] text-amber-300">
                    Melhor {formatTime(telemetry.bestLapTime)}
                  </div>
                )}
              </div>
            </div>

            {renderUtilityButtons()}
          </div>
        </div>

        {/* Portrait sub-header for License Objective / Wrong Way */}
        {layout.isPortrait && (mode === 'license' || telemetry.wrongWay) && (
          <div className="flex flex-col items-center gap-1.5">
            {renderLicenseObjective(true)}
            {telemetry.wrongWay && (
              <div className="px-3.5 py-1 rounded-lg bg-red-600/95 text-white font-display font-bold text-xs tracking-wider shadow-lg">
                SENTIDO INVERSO
              </div>
            )}
          </div>
        )}
      </div>

      {/* CENTER COUNTDOWN */}
      {telemetry.countdown > 0 && (
        <div className="my-auto mx-auto text-center">
          <div
            className={`font-display font-bold italic text-white tabular-nums ${
              layout.isCompactLandscape ? 'text-6xl' : 'text-7xl md:text-8xl'
            }`}
            style={{ textShadow: '0 6px 24px rgba(0,0,0,0.65)' }}
          >
            {telemetry.countdown}
          </div>
        </div>
      )}

      {/* BOTTOM SECTION */}
      {layout.isPortrait ? (
        /* PORTRAIT BOTTOM: Compact GT4 Telemetry Bar centered above Multi-Touch Controls */
        <div className="flex flex-col items-center gap-2 w-full">
          {renderCompactCluster()}
          {showTouchControls && (
            <TouchControls
              transmission={assists.transmission}
              steeringMode={steeringMode}
              gyroPermissionState={gyroPermissionState}
              compactLandscape={false}
              onRequestGyroPermission={onRequestGyroPermission}
              onTouchChange={onTouchChange}
              onShift={onTouchShift}
            />
          )}
        </div>
      ) : layout.isCompactLandscape || showTouchControls ? (
        /* COMPACT LANDSCAPE (or Desktop with Touch Controls enabled): Side thumb pads + Centered GT4 Cluster */
        <div className="relative flex items-end justify-between w-full min-h-[64px]">
          {showTouchControls ? (
            <>
              <TouchControls
                transmission={assists.transmission}
                steeringMode={steeringMode}
                gyroPermissionState={gyroPermissionState}
                compactLandscape={true}
                onRequestGyroPermission={onRequestGyroPermission}
                onTouchChange={onTouchChange}
                onShift={onTouchShift}
              />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-0 pointer-events-none">
                {renderCompactCluster()}
              </div>
            </>
          ) : (
            <div className="ml-auto">{renderCompactCluster()}</div>
          )}
        </div>
      ) : (
        /* FULL DESKTOP CLASSIC GT4 HUD */
        <div className="flex items-end justify-between gap-4">
          {/* BOTTOM-LEFT: Tire Grip Telemetry & Active Assists */}
          <div className="hud-plate rounded-xl px-3.5 py-2.5 flex flex-col gap-1.5 min-w-[175px]">
            <div className="flex items-center justify-between text-[11px] font-mono-num">
              <span
                className={
                  assists.tcs
                    ? telemetry.tcsActive
                      ? 'text-amber-400 font-bold'
                      : 'text-sky-300'
                    : 'text-slate-500'
                }
              >
                TCS
              </span>
              <span
                className={
                  assists.abs
                    ? telemetry.absActive
                      ? 'text-red-400 font-bold'
                      : 'text-sky-300'
                    : 'text-slate-500'
                }
              >
                ABS
              </span>
              <span className="text-slate-200 font-semibold">
                {assists.transmission === 'manual' ? 'MT' : 'AT'}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-slate-300 font-mono-num">
                <span className="w-9">DIANT</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${telemetry.frontSlip > 0.7 ? 'bg-red-500' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, telemetry.frontSlip * 75)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-300 font-mono-num">
                <span className="w-9">TRAS</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${telemetry.rearSlip > 0.7 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, telemetry.rearSlip * 75)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM-RIGHT: Classic GT4 Tachometer, Shift Light, Gear, Speedometer & Pedals */}
          <div className="hud-plate rounded-2xl p-3 flex items-center gap-3">
            {/* Pedal Bars (Brake / Throttle) */}
            <div className="flex items-end gap-1.5 h-[112px] py-1">
              <div className="flex flex-col items-center gap-1 h-full">
                <div className="w-2.5 flex-1 bg-slate-800 rounded-sm overflow-hidden flex flex-col justify-end">
                  <div
                    className="w-full bg-red-500"
                    style={{ height: `${Math.round(telemetry.brake * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono-num text-slate-400">F</span>
              </div>
              <div className="flex flex-col items-center gap-1 h-full">
                <div className="w-2.5 flex-1 bg-slate-800 rounded-sm overflow-hidden flex flex-col justify-end">
                  <div
                    className="w-full bg-sky-400"
                    style={{ height: `${Math.round(telemetry.throttle * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono-num text-slate-400">A</span>
              </div>
            </div>

            {/* Precision SVG Tachometer + Shift Light + Gear + Digital Speed */}
            <div className="relative w-[176px] h-[146px]">
              <svg viewBox="0 0 180 150" className="w-full h-full" aria-label="Conta-giros e Velocímetro">
                <circle
                  cx="90"
                  cy="84"
                  r="64"
                  fill="rgba(7,11,19,0.9)"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="2"
                />

                {Array.from({ length: Math.floor(maxGaugeRpm / 1000) + 1 }).map((_, idx) => {
                  const frac = (idx * 1000) / maxGaugeRpm;
                  const ang = ((startAngleDeg + frac * sweepDeg) * Math.PI) / 180;
                  const isRed = frac >= redlineFrac - 0.01;
                  const x1 = 90 + Math.cos(ang) * 51;
                  const y1 = 84 + Math.sin(ang) * 51;
                  const x2 = 90 + Math.cos(ang) * 60;
                  const y2 = 84 + Math.sin(ang) * 60;
                  const tx = 90 + Math.cos(ang) * 41;
                  const ty = 84 + Math.sin(ang) * 41 + 3;
                  return (
                    <g key={idx}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={isRed ? '#ef4444' : '#e2e8f0'}
                        strokeWidth={isRed ? 2.6 : 1.8}
                      />
                      <text
                        x={tx}
                        y={ty}
                        textAnchor="middle"
                        fontSize="9"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="700"
                        fill={isRed ? '#f87171' : '#cbd5e1'}
                      >
                        {idx}
                      </text>
                    </g>
                  );
                })}

                <g transform={`translate(90, 84) rotate(${needleDeg})`}>
                  <line x1="-10" y1="0" x2="54" y2="0" stroke="#ef4444" strokeWidth="2.8" strokeLinecap="round" />
                  <circle cx="0" cy="0" r="5" fill="#f8fafc" />
                </g>

                <rect
                  x="68"
                  y="11"
                  width="44"
                  height="13"
                  rx="3"
                  fill={telemetry.shiftLight ? '#ef4444' : '#1e293b'}
                  stroke={telemetry.shiftLight ? '#fca5a5' : 'rgba(255,255,255,0.2)'}
                  strokeWidth="1"
                />
                <text
                  x="90"
                  y="20.5"
                  textAnchor="middle"
                  fontSize="8.5"
                  fontFamily="Chakra Petch, sans-serif"
                  fontWeight="700"
                  fill={telemetry.shiftLight ? '#ffffff' : '#64748b'}
                >
                  SHIFT
                </text>

                <rect
                  x="114"
                  y="84"
                  width="32"
                  height="32"
                  rx="5"
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                <text
                  x="130"
                  y="107"
                  textAnchor="middle"
                  fontSize="22"
                  fontFamily="Chakra Petch, sans-serif"
                  fontWeight="700"
                  fill="#ffffff"
                >
                  {gearLabel}
                </text>

                <text
                  x="76"
                  y="124"
                  textAnchor="middle"
                  fontSize="26"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                  fill="#ffffff"
                >
                  {telemetry.speedKmh}
                </text>
                <text
                  x="76"
                  y="137"
                  textAnchor="middle"
                  fontSize="8.5"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                  fontWeight="600"
                  fill="#94a3b8"
                >
                  KM/H
                </text>
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
