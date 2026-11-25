import React, { useEffect, useState } from 'react';
import {
  Award,
  Car,
  ChevronLeft,
  Compass,
  Flame,
  Flag,
  Gamepad2,
  Gauge,
  Map,
  Maximize2,
  Minimize2,
  Moon,
  Palette,
  RotateCcw,
  Settings,
  ShoppingBag,
  Sun,
  Sunrise,
  Timer,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import {
  CARS,
  CHASSIS_UPGRADES,
  ENGINE_UPGRADES,
  GT_WING_PRICE,
  LICENSE_TESTS,
  PAINT_FINISH_OPTIONS,
  PAINT_ITEMS,
  RIM_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  TIRE_UPGRADES,
  TRACKS,
  WEIGHT_UPGRADES,
  getCarById,
  getTrackMetaById,
} from '../game/catalog';
import {
  TuningCategory,
  computeEffectiveSpecs,
  formatTime,
  getCarOwnedTires,
  getCarTuning,
} from '../game/progression';
import {
  AppScreen,
  AssistSettings,
  CameraMode,
  LicenseTestId,
  MedalType,
  PaintFinish,
  RaceMode,
  RimStyle,
  SaveState,
  SteeringMode,
  TimeOfDay,
  TrackId,
} from '../game/types';
import { ViewportLayout } from '../game/useViewportLayout';
import { GyroPermissionState } from './TouchControls';

interface GTModeHubProps {
  screen: Exclude<AppScreen, 'title' | 'playing' | 'paused' | 'result'>;
  save: SaveState;
  layout: ViewportLayout;
  isFullscreen: boolean;
  showTouchControls: boolean;
  touchModePreference: 'auto' | 'on' | 'off';
  gyroPermissionState: GyroPermissionState;
  feedbackMsg: string | null;
  onNavigate: (next: AppScreen, previewCarId?: string) => void;
  onPreviewCar: (carId: string) => void;
  onSelectCar: (carId: string) => void;
  onBuyCar: (carId: string) => void;
  onBuyUpgrade: (carId: string, category: TuningCategory, stage: number) => void;
  onBuyOrEquipPaint: (carId: string, paintId: string) => void;
  onSetPaintFinish: (carId: string, finish: PaintFinish) => void;
  onBuyOrEquipRim: (carId: string, rimId: RimStyle) => void;
  onToggleGtWing: (carId: string) => void;
  onSelectTrack: (trackId: TrackId) => void;
  onSelectTimeOfDay: (time: TimeOfDay) => void;
  onStartLicense: (licenseId: LicenseTestId) => void;
  onStartRace: (mode: Extract<RaceMode, 'race' | 'time_trial' | 'drift'>, totalLaps: number) => void;
  onUpdateAssists: (partial: Partial<AssistSettings>) => void;
  onUpdateDefaultCamera: (camera: CameraMode) => void;
  onUpdateSteeringMode: (mode: SteeringMode) => void;
  onRequestGyroPermission: () => void;
  onUpdateTouchPreference: (pref: 'auto' | 'on' | 'off') => void;
  onResetCareer: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
}

type ItemsTab = TuningCategory | 'visual';

function BrandMark({ compact }: { compact: boolean }) {
  return (
    <svg
      viewBox="0 0 42 24"
      className={compact ? 'w-5 h-3 shrink-0' : 'w-6 h-3.5 shrink-0'}
      aria-hidden="true"
    >
      <path d="M2 13 C 10 2, 24 2, 34 8 L 28 13 C 21 8, 12 8, 6 15 Z" fill="#dc2626" />
      <path d="M8 19 C 16 10, 29 10, 40 16 L 34 21 C 26 16, 17 16, 12 22 Z" fill="#2563eb" />
    </svg>
  );
}

function TimeIcon({ id, className }: { id: TimeOfDay; className?: string }) {
  if (id === 'sunset') return <Sunrise className={className ?? 'w-3.5 h-3.5'} />;
  if (id === 'night') return <Moon className={className ?? 'w-3.5 h-3.5'} />;
  return <Sun className={className ?? 'w-3.5 h-3.5'} />;
}

function MedalBadge({ medal }: { medal: MedalType }) {
  if (medal === 'none') {
    return <span className="text-[11px] font-medium text-slate-400">Sem medalha</span>;
  }
  const styles: Record<Exclude<MedalType, 'none'>, { label: string; color: string }> = {
    gold: { label: 'Ouro', color: '#ca8a04' },
    silver: { label: 'Prata', color: '#64748b' },
    bronze: { label: 'Bronze', color: '#b45309' },
  };
  const info = styles[medal];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: info.color }}>
      <Award className="w-3.5 h-3.5" />
      {info.label}
    </span>
  );
}

function StatBar({
  label,
  valueText,
  percent,
}: {
  label: string;
  valueText: string;
  percent: number;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-600 font-medium truncate pr-1">{label}</span>
        <span className="font-mono-num font-semibold text-slate-900 shrink-0">{valueText}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-700 transition-all duration-200"
          style={{ width: `${Math.max(6, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

export const GTModeHub: React.FC<GTModeHubProps> = ({
  screen,
  save,
  layout,
  isFullscreen,
  touchModePreference,
  gyroPermissionState,
  feedbackMsg,
  onNavigate,
  onPreviewCar,
  onSelectCar,
  onBuyCar,
  onBuyUpgrade,
  onBuyOrEquipPaint,
  onSetPaintFinish,
  onBuyOrEquipRim,
  onToggleGtWing,
  onSelectTrack,
  onSelectTimeOfDay,
  onStartLicense,
  onStartRace,
  onUpdateAssists,
  onUpdateDefaultCamera,
  onUpdateSteeringMode,
  onRequestGyroPermission,
  onUpdateTouchPreference,
  onResetCareer,
  onToggleFullscreen,
  onToggleMute,
}) => {
  const [raceChoice, setRaceChoice] = useState<'race' | 'time_trial' | 'drift'>('race');
  const [totalLaps, setTotalLaps] = useState<number>(3);
  const [inspectedCarId, setInspectedCarId] = useState<string>(save.selectedCarId);
  const [activeItemsTab, setActiveItemsTab] = useState<ItemsTab>('engineStage');
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  useEffect(() => {
    if (screen === 'garage' || screen === 'tuning') {
      setInspectedCarId(save.selectedCarId);
    } else if (screen === 'dealership') {
      const nextUnowned = CARS.find((c) => !save.ownedCarIds.includes(c.id))?.id ?? save.selectedCarId;
      setInspectedCarId(nextUnowned);
    }
  }, [screen, save.selectedCarId, save.ownedCarIds]);

  const activeCar = getCarById(save.selectedCarId);
  const activeTuning = getCarTuning(save, save.selectedCarId);
  const activeHasWing = Boolean(save.gtWingByCar[activeCar.id]);
  const activeSpecs = computeEffectiveSpecs(activeCar, activeTuning, activeHasWing);
  const activeTrackMeta = getTrackMetaById(save.selectedTrackId);

  // Live 3D Split Preview active in Garage, Dealership AND Tuning/Customization!
  const isSplit3DPreview = screen === 'garage' || screen === 'dealership' || screen === 'tuning';
  const isCompact = layout.height <= 520 || layout.width <= 920;
  const isSmallLandscape = layout.height <= 400 || layout.width <= 720;

  const handleInspect = (carId: string) => {
    setInspectedCarId(carId);
    onPreviewCar(carId);
  };

  const inspectedCar = getCarById(inspectedCarId);
  const inspectedTuning = getCarTuning(save, inspectedCar.id);
  const inspectedHasWing = Boolean(save.gtWingByCar[inspectedCar.id]);
  const inspectedSpecs = computeEffectiveSpecs(inspectedCar, inspectedTuning, inspectedHasWing);
  const inspectedOwned = save.ownedCarIds.includes(inspectedCar.id);

  const nextUnownedId = CARS.find((c) => !save.ownedCarIds.includes(c.id))?.id ?? CARS[0].id;
  const activePaintId = save.paintByCar[activeCar.id] ?? 'stock';
  const activeFinish: PaintFinish = save.paintFinishByCar[activeCar.id] ?? 'metallic';
  const activeRimId: RimStyle = save.rimStyleByCar[activeCar.id] ?? 'stock_5spoke';
  const ownedTires = getCarOwnedTires(save, activeCar.id);
  const ownsGtWing = save.ownedGtWingCars.includes(activeCar.id);

  const tuningGroups = [
    {
      shortTitle: 'Motor',
      title: 'Motor & Turbo (Estágios 1–3)',
      category: 'engineStage' as TuningCategory,
      options: ENGINE_UPGRADES,
      current: activeTuning.engineStage,
    },
    {
      shortTitle: 'Pneus',
      title: 'Composto de Pneus',
      category: 'tireStage' as TuningCategory,
      options: TIRE_UPGRADES,
      current: activeTuning.tireStage,
    },
    {
      shortTitle: 'Susp.',
      title: 'Suspensão & Freios (Rebaixa 3D)',
      category: 'chassisStage' as TuningCategory,
      options: CHASSIS_UPGRADES,
      current: activeTuning.chassisStage,
    },
    {
      shortTitle: 'Peso',
      title: 'Redução de Peso',
      category: 'weightStage' as TuningCategory,
      options: WEIGHT_UPGRADES,
      current: activeTuning.weightStage,
    },
  ];

  const navTabs: Array<{
    id: AppScreen;
    label: string;
    icon: React.ReactNode;
    previewCarId?: string;
  }> = [
    { id: 'race_setup', label: 'Modos', icon: <Flag className="w-3.5 h-3.5" /> },
    { id: 'garage', label: 'Garagem', icon: <Car className="w-3.5 h-3.5" />, previewCarId: save.selectedCarId },
    { id: 'dealership', label: 'Loja', icon: <ShoppingBag className="w-3.5 h-3.5" />, previewCarId: nextUnownedId },
    { id: 'tuning', label: 'Oficina', icon: <Wrench className="w-3.5 h-3.5" />, previewCarId: save.selectedCarId },
    { id: 'settings', label: 'Config.', icon: <Settings className="w-3.5 h-3.5" /> },
  ];

  const renderTuningList = (group: (typeof tuningGroups)[number]) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-xs sm:text-sm text-slate-900">{group.title}</h2>
        <span className="text-[10px] text-emerald-700 font-semibold">
          Equipamentos liberados para teste
        </span>
      </div>
      <div className="space-y-1.5">
        {group.options.map((opt) => {
          const isTire = group.category === 'tireStage';
          const installed = opt.stage === group.current;
          const isUnlockedOrFree =
            opt.price === 0 ||
            (isTire ? ownedTires.includes(opt.stage) : opt.stage < group.current);
          const canAfford = save.credits >= opt.price;
          return (
            <div
              key={opt.stage}
              className={`rounded-xl border flex items-center justify-between gap-2 ${
                isSmallLandscape ? 'p-2' : 'p-2.5'
              } ${installed ? 'bg-blue-50/95 border-blue-600' : 'bg-white border-slate-200'}`}
            >
              <div className="min-w-0">
                <div className="font-semibold text-xs text-slate-900 leading-tight">{opt.name}</div>
                <div className="text-[10px] text-slate-600 leading-snug">{opt.summary}</div>
              </div>
              <div className="shrink-0">
                {installed ? (
                  <span className="text-[11px] font-bold text-blue-700 whitespace-nowrap">Equipado</span>
                ) : isUnlockedOrFree ? (
                  <button
                    type="button"
                    onClick={() => onBuyUpgrade(activeCar.id, group.category, opt.stage)}
                    className="min-h-[34px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    Equipar
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canAfford}
                    onClick={() => onBuyUpgrade(activeCar.id, group.category, opt.stage)}
                    className={`min-h-[34px] px-2.5 rounded-lg font-mono-num text-[11px] font-bold whitespace-nowrap transition-colors ${
                      canAfford
                        ? 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer'
                        : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {opt.price.toLocaleString('pt-BR')} Cr.
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className={`fixed inset-0 z-20 flex flex-col safe-area-hud ${
        isSplit3DPreview ? 'pointer-events-none' : 'gt-surface pointer-events-auto'
      }`}
    >
      {/* Top Horizontal Navigation Strip */}
      <div
        className={`pointer-events-auto flex items-center justify-between gap-2 bg-white/95 border-b border-slate-300/80 shadow-sm shrink-0 ${
          isCompact ? 'px-2.5 py-1' : 'px-5 md:px-7 py-2.5'
        }`}
      >
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('title')}
            className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              isCompact ? 'min-h-[36px] px-2' : 'min-h-[38px] px-3'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Início</span>
          </button>

          <div className="hidden md:flex items-center gap-1.5">
            <BrandMark compact={isCompact} />
            <span className="font-display font-bold italic text-sm md:text-base tracking-tight text-slate-900 whitespace-nowrap">
              AT <span className="text-red-600">4</span>
            </span>
          </div>
        </div>

        <nav
          aria-label="Navegação principal"
          className="flex items-center gap-1 overflow-x-auto py-0.5 min-w-0"
        >
          {navTabs.map((tab) => {
            const isActive =
              screen === tab.id || (tab.id === 'race_setup' && screen === 'license');
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id, tab.previewCarId)}
                className={`inline-flex items-center gap-1 rounded-lg font-display font-semibold text-xs whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isCompact ? 'min-h-[36px] px-2' : 'min-h-[38px] px-3.5'
                } ${
                  isActive
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="text-right pr-1">
            <div className="hidden md:block text-[9px] text-slate-500 leading-none">Créditos</div>
            <div
              data-testid="credits-balance"
              className="font-mono-num font-bold text-xs sm:text-sm text-blue-800 leading-tight whitespace-nowrap"
            >
              {save.credits.toLocaleString('pt-BR')} Cr.
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia horizontal'}
            title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia (Horizontal)'}
            className="min-h-[36px] px-2.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 flex items-center gap-1 text-xs font-display font-semibold cursor-pointer shrink-0"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">{isFullscreen ? 'Sair' : 'Tela Cheia'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={save.muted ? 'Ativar áudio' : 'Silenciar áudio'}
            className="w-9 h-9 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer shrink-0"
          >
            {save.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Inline non-blocking feedback banner */}
      {feedbackMsg && (
        <div className="pointer-events-auto px-4 py-1.5 bg-blue-800 text-white text-xs font-medium text-center shrink-0">
          {feedbackMsg}
        </div>
      )}

      {/* MAIN CONTENT BODY */}
      <div className={`flex-1 min-h-0 ${isSplit3DPreview ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'}`}>
        {/* 1. MODOS DE JOGO + 3 PISTAS + 3 HORÁRIOS (DIA / PÔR DO SOL / NOITE) */}
        {(screen === 'race_setup' || screen === 'gt_home') && (
          <div
            className={`max-w-5xl mx-auto ${
              isSmallLandscape ? 'px-3 py-2 space-y-2' : isCompact ? 'px-4 py-3 space-y-3' : 'px-6 py-5 space-y-4'
            }`}
          >
            {/* Row 1: 4 Modalidades Jogáveis */}
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setRaceChoice('race')}
                className={`gt-node rounded-xl text-left flex flex-col justify-between gap-1 cursor-pointer ${
                  isSmallLandscape ? 'p-2' : 'p-3'
                } ${raceChoice === 'race' ? 'border-blue-600 bg-blue-50/90 ring-1 ring-blue-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-7 h-7 rounded-full bg-blue-700 text-white flex items-center justify-center">
                    <Flag className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-mono-num text-[10px] font-bold text-blue-700">6.000 Cr.</span>
                </div>
                <div>
                  <div className="font-display font-bold text-xs sm:text-sm text-slate-900">Corrida vs IA</div>
                  <div className="text-[10px] text-slate-600 leading-tight hidden sm:block">
                    Grid com 3 rivais competitivos
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRaceChoice('time_trial')}
                className={`gt-node rounded-xl text-left flex flex-col justify-between gap-1 cursor-pointer ${
                  isSmallLandscape ? 'p-2' : 'p-3'
                } ${raceChoice === 'time_trial' ? 'border-blue-600 bg-blue-50/90 ring-1 ring-blue-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center">
                    <Timer className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-mono-num text-[10px] font-bold text-slate-600">
                    {formatTime(save.bestCircuitLapSec)}
                  </span>
                </div>
                <div>
                  <div className="font-display font-bold text-xs sm:text-sm text-slate-900">Time Trial</div>
                  <div className="text-[10px] text-slate-600 leading-tight hidden sm:block">
                    Volta livre contra o cronômetro
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRaceChoice('drift')}
                className={`gt-node rounded-xl text-left flex flex-col justify-between gap-1 cursor-pointer ${
                  isSmallLandscape ? 'p-2' : 'p-3'
                } ${raceChoice === 'drift' ? 'border-orange-500 bg-orange-50/90 ring-1 ring-orange-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center">
                    <Flame className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-mono-num text-[10px] font-bold text-orange-700">TCS OFF</span>
                </div>
                <div>
                  <div className="font-display font-bold text-xs sm:text-sm text-slate-900">Treino Drift</div>
                  <div className="text-[10px] text-slate-600 leading-tight hidden sm:block">
                    Pista aberta para derrapagens
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('license')}
                className={`gt-node rounded-xl text-left flex flex-col justify-between gap-1 cursor-pointer ${
                  isSmallLandscape ? 'p-2' : 'p-3'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-7 h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center">
                    <Award className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-mono-num text-[10px] font-bold text-emerald-700">B-1..B-3</span>
                </div>
                <div>
                  <div className="font-display font-bold text-xs sm:text-sm text-slate-900">Licenças GT</div>
                  <div className="text-[10px] text-slate-600 leading-tight hidden sm:block">
                    Desafios técnicos e medalhas
                  </div>
                </div>
              </button>
            </div>

            {/* Row 2: 3 Circuitos Selecionáveis + 3 Horários / Atmosfera */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3">
              {/* Track Selector (8 cols) */}
              <div className={`md:col-span-8 gt-panel rounded-2xl ${isSmallLandscape ? 'p-2.5 space-y-1.5' : 'p-3.5 space-y-2'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs sm:text-sm text-slate-900 inline-flex items-center gap-1.5">
                    <Map className="w-4 h-4 text-blue-700" />
                    Circuito
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono-num">
                    {activeTrackMeta.lengthKm} · {activeTrackMeta.difficulty}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {TRACKS.map((trk) => {
                    const selected = save.selectedTrackId === trk.id;
                    return (
                      <button
                        key={trk.id}
                        type="button"
                        onClick={() => onSelectTrack(trk.id)}
                        className={`rounded-xl border text-left p-2 transition-all cursor-pointer ${
                          selected
                            ? 'bg-blue-50 border-blue-600 ring-1 ring-blue-500'
                            : 'bg-white border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <div className="font-display font-bold text-xs text-slate-900 leading-tight">
                          {trk.name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                          {trk.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time of Day / Atmosphere Selector (4 cols) */}
              <div className={`md:col-span-4 gt-panel rounded-2xl ${isSmallLandscape ? 'p-2.5 space-y-1.5' : 'p-3.5 space-y-2'}`}>
                <div className="font-display font-bold text-xs sm:text-sm text-slate-900 inline-flex items-center gap-1.5">
                  <TimeIcon id={save.selectedTimeOfDay} className="w-4 h-4 text-amber-600" />
                  Horário e Clima
                </div>
                <div className="grid grid-cols-3 md:grid-cols-1 gap-1.5">
                  {TIME_OF_DAY_OPTIONS.map((opt) => {
                    const selected = save.selectedTimeOfDay === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSelectTimeOfDay(opt.id)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                          selected
                            ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <TimeIcon id={opt.id} className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-display font-bold text-xs truncate">{opt.label}</span>
                        </div>
                        <span
                          className={`hidden xl:inline text-[10px] truncate ${
                            selected ? 'text-sky-300' : 'text-slate-500'
                          }`}
                        >
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Row 3: Assists, Laps & Active Car Launch Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className={`gt-panel rounded-2xl flex flex-wrap items-center justify-between gap-2 ${isSmallLandscape ? 'p-2.5' : 'p-3.5'}`}>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAssists({
                        transmission: save.assists.transmission === 'auto' ? 'manual' : 'auto',
                      })
                    }
                    className="min-h-[34px] px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer"
                  >
                    {save.assists.transmission === 'manual' ? 'Manual (MT)' : 'Automático (AT)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateAssists({ tcs: !save.assists.tcs })}
                    className={`min-h-[34px] px-2.5 rounded-lg font-semibold cursor-pointer ${
                      save.assists.tcs ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    TCS: {save.assists.tcs ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateAssists({ abs: !save.assists.abs })}
                    className={`min-h-[34px] px-2.5 rounded-lg font-semibold cursor-pointer ${
                      save.assists.abs ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    ABS: {save.assists.abs ? 'ON' : 'OFF'}
                  </button>
                </div>

                {raceChoice === 'race' && (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-500 mr-0.5">Voltas:</span>
                    {[2, 3, 5].map((laps) => (
                      <button
                        key={laps}
                        type="button"
                        onClick={() => setTotalLaps(laps)}
                        className={`min-w-[32px] min-h-[32px] rounded-md text-xs font-mono-num font-bold cursor-pointer ${
                          totalLaps === laps
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {laps}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={`gt-panel rounded-2xl flex items-center justify-between gap-3 ${isSmallLandscape ? 'p-2.5' : 'p-3.5'}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Gauge className="w-6 h-6 text-blue-700 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm text-slate-900 truncate">
                      {activeCar.manufacturer} {activeCar.name}
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono-num truncate">
                      {activeCar.drivetrain} · {activeSpecs.hp} HP · {activeSpecs.massKg} kg
                      {activeSpecs.isDriftTire ? ' · Pneu Drift' : ` · μ ${activeSpecs.tireGripMu.toFixed(2)}`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onStartRace(raceChoice, totalLaps)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-display font-bold text-sm tracking-wide shadow-md cursor-pointer whitespace-nowrap shrink-0"
                >
                  Largar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. GARAGEM & LOJA (7 Carros com Preview 3D PBR ao vivo à direita) */}
        {(screen === 'garage' || screen === 'dealership') && (
          <div
            className={`h-full flex flex-row items-stretch justify-between ${
              isSmallLandscape ? 'p-2 gap-2.5' : 'p-4 md:p-5 gap-5'
            }`}
          >
            <div
              className={`pointer-events-auto gt-panel flex flex-col overflow-hidden rounded-2xl max-h-full shrink-0 ${
                isSmallLandscape ? 'w-[48%] min-w-[275px] max-w-[350px]' : 'w-[370px] md:w-[440px]'
              }`}
            >
              <div
                className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${
                  isCompact ? 'p-3 space-y-2.5' : 'p-4 space-y-3.5'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h1 className={`font-display font-bold text-slate-900 ${isCompact ? 'text-base' : 'text-xl'}`}>
                    {screen === 'garage' ? 'Garagem' : `Loja · ${CARS.length} Carros`}
                  </h1>
                  <span className="font-mono-num text-[11px] text-slate-500">
                    {save.ownedCarIds.length}/{CARS.length} na garagem
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {(screen === 'garage'
                    ? CARS.filter((c) => save.ownedCarIds.includes(c.id))
                    : CARS
                  ).map((car) => {
                    const owned = save.ownedCarIds.includes(car.id);
                    const isSelected = save.selectedCarId === car.id;
                    const isInspected = inspectedCar.id === car.id;
                    return (
                      <button
                        key={car.id}
                        type="button"
                        onClick={() => handleInspect(car.id)}
                        className={`w-full text-left rounded-xl border p-2 flex flex-col justify-between gap-1 min-h-[54px] transition-all cursor-pointer ${
                          isInspected
                            ? 'bg-blue-50/90 border-blue-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
                            style={{ backgroundColor: car.colorHex }}
                          />
                          <span className="font-display font-bold text-xs text-slate-900 truncate">
                            {car.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-mono-num text-slate-500">
                            {car.drivetrain} · {car.baseHp}HP
                          </span>
                          {isSelected ? (
                            <span className="font-bold text-blue-700">Ativo</span>
                          ) : owned ? (
                            <span className="font-semibold text-emerald-700">Garagem</span>
                          ) : (
                            <span className="font-mono-num font-bold text-slate-800">
                              {car.price.toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div>
                    <div className="text-[11px] text-slate-500">
                      {inspectedCar.manufacturer} · {inspectedCar.year} · Tração {inspectedCar.drivetrain}
                    </div>
                    <h2 className="font-display font-bold text-sm sm:text-base text-slate-900">
                      {inspectedCar.name}
                    </h2>
                    {!isSmallLandscape && (
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                        {inspectedCar.handlingNote}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <StatBar
                      label="Potência"
                      valueText={`${inspectedSpecs.hp} HP`}
                      percent={(inspectedSpecs.hp / 600) * 100}
                    />
                    <StatBar
                      label="Torque"
                      valueText={`${inspectedSpecs.torqueNm} Nm`}
                      percent={(inspectedSpecs.torqueNm / 720) * 100}
                    />
                    <StatBar
                      label="Peso"
                      valueText={`${inspectedSpecs.massKg} kg`}
                      percent={((1750 - inspectedSpecs.massKg) / 950) * 100}
                    />
                    <StatBar
                      label="Aderência"
                      valueText={inspectedSpecs.isDriftTire ? 'DRIFT' : `μ ${inspectedSpecs.tireGripMu.toFixed(2)}`}
                      percent={(inspectedSpecs.tireGripMu / 1.65) * 100}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white/95 p-2.5 shrink-0">
                {inspectedOwned ? (
                  save.selectedCarId === inspectedCar.id ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('tuning', inspectedCar.id)}
                      className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-display font-semibold text-sm cursor-pointer"
                    >
                      Abrir Oficina & Customização 3D
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectCar(inspectedCar.id)}
                      className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-display font-semibold text-sm cursor-pointer"
                    >
                      Equipar {inspectedCar.name}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={save.credits < inspectedCar.price}
                    onClick={() => onBuyCar(inspectedCar.id)}
                    className={`w-full min-h-[42px] py-2 px-4 rounded-xl font-display font-semibold text-sm transition-colors ${
                      save.credits >= inspectedCar.price
                        ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                        : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {save.credits >= inspectedCar.price
                      ? `Comprar por ${inspectedCar.price.toLocaleString('pt-BR')} Cr.`
                      : `Faltam ${(inspectedCar.price - save.credits).toLocaleString('pt-BR')} Cr.`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. OFICINA DE TUNING & CUSTOMIZAÇÃO VISUAL (COM PREVIEW 3D AO VIVO À DIREITA!) */}
        {screen === 'tuning' && (
          <div
            className={`h-full flex flex-row items-stretch justify-between ${
              isSmallLandscape ? 'p-2 gap-2.5' : 'p-4 md:p-5 gap-5'
            }`}
          >
            <div
              className={`pointer-events-auto gt-panel flex flex-col overflow-hidden rounded-2xl max-h-full shrink-0 ${
                isSmallLandscape ? 'w-[52%] min-w-[300px] max-w-[380px]' : 'w-[410px] md:w-[475px]'
              }`}
            >
              {/* Header + Live Specs Summary */}
              <div className={`border-b border-slate-200 shrink-0 ${isSmallLandscape ? 'p-2.5 space-y-1.5' : 'p-3.5 space-y-2'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h1 className="font-display font-bold text-sm sm:text-base text-slate-900 truncate">
                    Oficina · {activeCar.name}
                  </h1>
                  <span className="font-mono-num text-[11px] font-bold text-blue-800 shrink-0">
                    {activeSpecs.hp} HP · {activeSpecs.massKg} kg
                  </span>
                </div>

                {/* 5 Sub-Tabs: Motor · Pneus · Susp. · Peso · Visual 3D */}
                <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-xl">
                  {tuningGroups.map((g) => (
                    <button
                      key={g.category}
                      type="button"
                      onClick={() => setActiveItemsTab(g.category)}
                      className={`min-h-[34px] rounded-lg text-[11px] font-display font-bold transition-colors cursor-pointer ${
                        activeItemsTab === g.category
                          ? 'bg-blue-700 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      {g.shortTitle}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setActiveItemsTab('visual')}
                    className={`min-h-[34px] rounded-lg text-[11px] font-display font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      activeItemsTab === 'visual'
                        ? 'bg-blue-700 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    <Palette className="w-3 h-3" />
                    <span>Visual</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Tuning / Visual Options */}
              <div
                className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${
                  isSmallLandscape ? 'p-2.5 space-y-2.5' : 'p-3.5 space-y-3.5'
                }`}
              >
                {activeItemsTab === 'visual' ? (
                  <div className="space-y-3.5">
                    {/* 1. Acabamento PBR (Metálico / Fosco / Cromado) */}
                    <div className="space-y-1.5">
                      <div className="font-display font-bold text-xs text-slate-900">
                        Acabamento PBR da Pintura
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {PAINT_FINISH_OPTIONS.map((fin) => {
                          const selected = activeFinish === fin.id;
                          return (
                            <button
                              key={fin.id}
                              type="button"
                              onClick={() => onSetPaintFinish(activeCar.id, fin.id)}
                              className={`rounded-xl border px-2 py-2 text-center transition-all cursor-pointer ${
                                selected
                                  ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                                  : 'bg-white border-slate-200 text-slate-800 hover:border-slate-400'
                              }`}
                            >
                              <div className="font-display font-bold text-xs">{fin.label}</div>
                              <div className={`text-[9px] mt-0.5 ${selected ? 'text-sky-300' : 'text-slate-500'}`}>
                                {fin.hint}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Aerofólio GT */}
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-display font-bold text-xs text-slate-900">
                          Aerofólio GT em Carbono
                        </div>
                        <div className="text-[10px] text-slate-500">
                          +Downforce em alta velocidade · Visual GT3
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!ownsGtWing && save.credits < GT_WING_PRICE}
                        onClick={() => onToggleGtWing(activeCar.id)}
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-display font-bold whitespace-nowrap cursor-pointer ${
                          activeHasWing
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : ownsGtWing
                              ? 'bg-slate-800 hover:bg-slate-900 text-white'
                              : save.credits >= GT_WING_PRICE
                                ? 'bg-blue-700 hover:bg-blue-800 text-white'
                                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {activeHasWing
                          ? 'Equipado (Remover)'
                          : ownsGtWing
                            ? 'Equipar'
                            : `${GT_WING_PRICE.toLocaleString('pt-BR')} Cr.`}
                      </button>
                    </div>

                    {/* 3. 4 Estilos de Rodas / Aros */}
                    <div className="space-y-1.5">
                      <div className="font-display font-bold text-xs text-slate-900">
                        Rodas & Aros Esportivos (4 Estilos)
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {RIM_OPTIONS.map((rim) => {
                          const owned = save.ownedRimStyles.includes(rim.id) || rim.price === 0;
                          const equipped = activeRimId === rim.id;
                          const canAfford = save.credits >= rim.price;
                          return (
                            <button
                              key={rim.id}
                              type="button"
                              disabled={!owned && !canAfford}
                              onClick={() => onBuyOrEquipRim(activeCar.id, rim.id)}
                              className={`p-2 rounded-xl border text-left flex flex-col justify-between gap-1 transition-all ${
                                equipped
                                  ? 'bg-blue-50 border-blue-600 ring-1 ring-blue-500 cursor-pointer'
                                  : owned || canAfford
                                    ? 'bg-white border-slate-200 hover:border-slate-400 cursor-pointer'
                                    : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                              }`}
                            >
                              <div>
                                <div className="font-display font-bold text-xs text-slate-900">{rim.name}</div>
                                <div className="text-[10px] text-slate-500 leading-tight">{rim.summary}</div>
                              </div>
                              <div className="text-right font-mono-num text-[10px] font-bold">
                                {equipped ? (
                                  <span className="text-blue-700">Equipado</span>
                                ) : owned ? (
                                  <span className="text-emerald-700">Aplicar</span>
                                ) : (
                                  <span className="text-slate-800">{rim.price.toLocaleString('pt-BR')} Cr.</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 4. Cores de Pintura */}
                    <div className="space-y-1.5">
                      <div className="font-display font-bold text-xs text-slate-900">Cores da Carroceria</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PAINT_ITEMS.map((paint) => {
                          const owned = save.ownedPaintIds.includes(paint.id) || paint.price === 0;
                          const equipped = activePaintId === paint.id;
                          const swatchHex = paint.hex || activeCar.colorHex;
                          const canAfford = save.credits >= paint.price;
                          return (
                            <button
                              key={paint.id}
                              type="button"
                              disabled={!owned && !canAfford}
                              onClick={() => onBuyOrEquipPaint(activeCar.id, paint.id)}
                              className={`p-2 rounded-xl border text-left flex items-center justify-between gap-1.5 transition-all ${
                                equipped
                                  ? 'bg-blue-50 border-blue-600 ring-1 ring-blue-500 cursor-pointer'
                                  : owned || canAfford
                                    ? 'bg-white border-slate-200 hover:border-slate-400 cursor-pointer'
                                    : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-5 h-5 rounded-full border border-slate-300 shrink-0"
                                  style={{ backgroundColor: swatchHex }}
                                />
                                <span className="font-display font-bold text-[11px] text-slate-900 truncate">
                                  {paint.name}
                                </span>
                              </div>
                              <span className="font-mono-num text-[10px] font-bold shrink-0">
                                {equipped ? (
                                  <span className="text-blue-700">OK</span>
                                ) : owned ? (
                                  <span className="text-emerald-700">Usar</span>
                                ) : (
                                  <span className="text-slate-700">{paint.price}</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  renderTuningList(
                    tuningGroups.find((g) => g.category === activeItemsTab) ?? tuningGroups[0],
                  )
                )}
              </div>

              {/* Footer Telemetry Strip */}
              <div className="border-t border-slate-200 bg-white/95 px-3 py-2 flex items-center justify-between text-[11px] font-mono-num shrink-0">
                <span className="text-slate-600">
                  Altura: <strong className="text-slate-900">-{Math.round(activeSpecs.rideHeightDropM * 1000)}mm</strong>
                  {activeSpecs.hasTurbo && <span className="ml-2 text-blue-700 font-bold">TURBO ON</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('race_setup')}
                  className="min-h-[34px] px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-display font-bold text-xs cursor-pointer"
                >
                  Ir para Pista
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. CENTRO DE LICENÇAS (B-1 · B-2 · B-3) */}
        {screen === 'license' && (
          <div
            className={`max-w-5xl mx-auto ${
              isSmallLandscape ? 'px-3 py-2 space-y-2' : 'px-5 py-4 space-y-4'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-300/70 pb-2">
              <h1 className={`font-display font-bold text-slate-900 ${isCompact ? 'text-base sm:text-lg' : 'text-2xl'}`}>
                Centro de Licenças (B-1 · B-2 · B-3)
              </h1>
              <button
                type="button"
                onClick={() => onNavigate('race_setup')}
                className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                Voltar aos Modos
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
              {LICENSE_TESTS.map((test) => {
                const rec = save.licenseRecords[test.id];
                const testCar = getCarById(test.carId);
                return (
                  <div
                    key={test.id}
                    className={`gt-panel rounded-2xl flex flex-col justify-between ${
                      isSmallLandscape ? 'p-2.5 space-y-2' : 'p-4 space-y-3'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display font-bold text-base sm:text-lg text-blue-800">
                          {test.code}
                        </span>
                        <MedalBadge medal={rec.medal} />
                      </div>
                      <h2 className="font-display font-bold text-xs sm:text-sm text-slate-900 leading-tight">
                        {test.title}
                      </h2>
                      <div className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                        {testCar.name} ({testCar.drivetrain})
                      </div>
                      <div className="pt-1 border-t border-slate-200 space-y-0.5 font-mono-num text-[10px] sm:text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-amber-600 font-semibold">Ouro</span>
                          <span className="text-slate-900">{test.goldTime.toFixed(1)}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-semibold">Prata</span>
                          <span className="text-slate-900">{test.silverTime.toFixed(1)}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-orange-700 font-semibold">Bronze</span>
                          <span className="text-slate-900">{test.bronzeTime.toFixed(1)}s</span>
                        </div>
                        <div className="flex justify-between pt-0.5 border-t border-slate-100">
                          <span className="text-slate-500">Melhor</span>
                          <span className="font-bold text-slate-900">{formatTime(rec.bestTime)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onStartLicense(test.id)}
                      className="w-full min-h-[38px] py-1.5 px-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-display font-semibold text-xs sm:text-sm cursor-pointer"
                    >
                      Iniciar {test.code}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. CONFIGURAÇÕES DO JOGO (Controles Mobile: Botões / Volante Virtual / Giroscópio iOS) */}
        {screen === 'settings' && (
          <div
            className={`max-w-5xl mx-auto ${
              isSmallLandscape ? 'px-3 py-2 space-y-2.5' : 'px-5 py-5 space-y-4'
            }`}
          >
            <div className="border-b border-slate-300/70 pb-2">
              <h1 className={`font-display font-bold text-slate-900 ${isCompact ? 'text-base sm:text-lg' : 'text-2xl'}`}>
                Configurações do Jogo
              </h1>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Column 1: Pilotagem, Câmbio e Câmera */}
              <div className={`gt-panel rounded-2xl ${isSmallLandscape ? 'p-3 space-y-2.5' : 'p-4 space-y-3.5'}`}>
                <div className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-700" />
                  Pilotagem e Câmera
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-slate-800">Transmissão</span>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                    {(['auto', 'manual'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onUpdateAssists({ transmission: mode })}
                        className={`min-h-[36px] px-3 rounded-md text-xs font-semibold cursor-pointer ${
                          save.assists.transmission === mode
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        {mode === 'auto' ? 'Automático' : 'Manual'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <span className="text-xs sm:text-sm font-semibold text-slate-800">
                    Controle de Tração (TCS)
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={save.assists.tcs}
                    onClick={() => onUpdateAssists({ tcs: !save.assists.tcs })}
                    className={`min-h-[36px] min-w-[78px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                      save.assists.tcs ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {save.assists.tcs ? 'Ligado' : 'Desligado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <span className="text-xs sm:text-sm font-semibold text-slate-800">Freios ABS</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={save.assists.abs}
                    onClick={() => onUpdateAssists({ abs: !save.assists.abs })}
                    className={`min-h-[36px] min-w-[78px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                      save.assists.abs ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {save.assists.abs ? 'Ligado' : 'Desligado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <span className="text-xs sm:text-sm font-semibold text-slate-800">Câmera Padrão</span>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'chase', label: 'Traseira' },
                        { id: 'bumper', label: 'Capô' },
                        { id: 'cinematic', label: 'Cinema' },
                      ] as const
                    ).map((cam) => (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => onUpdateDefaultCamera(cam.id)}
                        className={`min-h-[36px] px-2.5 rounded-md text-xs font-semibold cursor-pointer ${
                          save.defaultCamera === cam.id
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        {cam.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Column 2: Controles Mobile (Botões / Volante / Giroscópio), Tela e Sistema */}
              <div className={`gt-panel rounded-2xl ${isSmallLandscape ? 'p-3 space-y-2.5' : 'p-4 space-y-3.5'}`}>
                <div className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-blue-700" />
                  Controles Mobile, Tela e Sistema
                </div>

                {/* Mobile Steering Mode: Botões / Volante Virtual / Giroscópio */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-slate-800">Direção Mobile</span>
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                      {(
                        [
                          { id: 'buttons', label: 'Botões' },
                          { id: 'wheel', label: 'Volante' },
                          { id: 'gyro', label: 'Giroscópio' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onUpdateSteeringMode(opt.id)}
                          className={`min-h-[34px] px-2.5 rounded-md text-xs font-semibold cursor-pointer ${
                            save.steeringMode === opt.id
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {save.steeringMode === 'gyro' && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1.5">
                      <span className="text-[11px] text-blue-900 inline-flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 shrink-0" />
                        {gyroPermissionState === 'granted'
                          ? 'Sensor de inclinação autorizado!'
                          : gyroPermissionState === 'denied'
                            ? 'Permissão negada nas configurações do navegador.'
                            : 'No iOS (Safari), toque para autorizar o giroscópio.'}
                      </span>
                      {gyroPermissionState !== 'granted' && (
                        <button
                          type="button"
                          onClick={onRequestGyroPermission}
                          className="min-h-[30px] px-2.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-bold cursor-pointer shrink-0"
                        >
                          Autorizar iOS
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Touch Controls Visibility */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <span className="text-xs sm:text-sm font-semibold text-slate-800">Controles na Tela</span>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'auto', label: 'Auto' },
                        { id: 'on', label: 'Ligado' },
                        { id: 'off', label: 'Deslig.' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdateTouchPreference(opt.id)}
                        className={`min-h-[34px] px-2.5 rounded-md text-xs font-semibold cursor-pointer ${
                          touchModePreference === opt.id
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fullscreen Landscape */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-slate-800">Tela Cheia (Horizontal)</div>
                    <div className="text-[11px] text-slate-500">Trava em paisagem · 60 FPS otimizado</div>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleFullscreen}
                    className="min-h-[36px] px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    {isFullscreen ? 'Sair' : 'Ativar'}
                  </button>
                </div>

                {/* Audio + Reset */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                      !save.muted ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    Som: {save.muted ? 'Mudo' : 'Ativo'}
                  </button>

                  {confirmReset ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmReset(false);
                          onResetCareer();
                        }}
                        className="min-h-[36px] px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Confirmar Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReset(false)}
                        className="min-h-[36px] px-2.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmReset(true)}
                      className="min-h-[36px] px-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Resetar Carreira
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
