import React, { useEffect } from 'react';
import {
  Car,
  Flag,
  Maximize2,
  Minimize2,
  Play,
  Settings,
  ShoppingBag,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { CARS, LICENSE_TESTS, getCarById } from '../game/catalog';
import { computeEffectiveSpecs, getCarTuning } from '../game/progression';
import { AppScreen, SaveState } from '../game/types';
import { ViewportLayout } from '../game/useViewportLayout';

interface TitleScreenProps {
  save: SaveState;
  layout: ViewportLayout;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onNavigate: (next: AppScreen, previewCarId?: string) => void;
  onQuickRace: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  save,
  layout,
  isFullscreen,
  onToggleFullscreen,
  onToggleMute,
  onNavigate,
  onQuickRace,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        onQuickRace();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onQuickRace]);

  const activeCar = getCarById(save.selectedCarId);
  const activeSpecs = computeEffectiveSpecs(
    activeCar,
    getCarTuning(save, save.selectedCarId),
    Boolean(save.gtWingByCar[activeCar.id]),
  );
  const medalsCount = Object.values(save.licenseRecords).filter((r) => r.medal !== 'none').length;
  const nextUnownedCarId = CARS.find((c) => !save.ownedCarIds.includes(c.id))?.id ?? CARS[0].id;

  const isCompact = layout.height <= 520 || layout.width <= 920;
  const isTiny = layout.height <= 390 || layout.width <= 680;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between overflow-hidden pointer-events-none safe-area-hud">
      {/* Clean top & bottom scrims keeping the center 3D hero car bright and completely unobstructed */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,14,26,0.78) 0%, rgba(8,14,26,0.22) 22%, rgba(8,14,26,0.0) 40%, rgba(8,14,26,0.0) 60%, rgba(8,14,26,0.76) 84%, rgba(8,14,26,0.95) 100%)',
        }}
      />

      {/* TOP BAR: Apex Turismo 4 Logo (Left) | Active Car & Credits + Fullscreen + Audio (Right) */}
      <div
        className={`relative z-10 flex items-center justify-between gap-2 shrink-0 ${
          isTiny ? 'px-3 pt-2' : isCompact ? 'px-4 pt-2.5' : 'px-7 pt-5'
        }`}
      >
        {/* Brand Logo Lockup */}
        <svg
          viewBox="0 0 445 148"
          className={`h-auto shrink-0 ${
            isTiny ? 'w-[165px]' : isCompact ? 'w-[205px]' : 'w-[280px]'
          }`}
          role="img"
          aria-label="Apex Turismo 4"
        >
          <path
            d="M14 34 C 38 10, 82 10, 108 26 L 94 40 C 74 28, 46 28, 28 44 Z"
            fill="#dc2626"
          />
          <path
            d="M28 48 C 52 28, 92 28, 122 42 L 108 56 C 84 44, 58 44, 42 58 Z"
            fill="#2563eb"
          />
          <rect x="14" y="64" width="405" height="2" fill="rgba(255,255,255,0.28)" />
          <text
            x="14"
            y="108"
            fill="#ffffff"
            fontFamily="Chakra Petch, sans-serif"
            fontWeight="700"
            fontStyle="italic"
            fontSize="42"
            letterSpacing="1.2"
          >
            APEX TURISMO
          </text>
          <text
            x="358"
            y="108"
            fill="#ef4444"
            fontFamily="Chakra Petch, sans-serif"
            fontWeight="700"
            fontStyle="italic"
            fontSize="52"
          >
            4
          </text>
          <text
            x="16"
            y="134"
            fill="#cbd5e1"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="500"
            fontSize="13.5"
            letterSpacing="3.2"
          >
            THE REAL SIMCADE DRIVING SIMULATOR
          </text>
        </svg>

        {/* Top-Right Status + Easy-Access Fullscreen & Audio Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 pointer-events-auto min-w-0">
          {/* Active Car & Credits Telemetry Pill */}
          <div
            className={`hud-plate rounded-xl flex items-center gap-2.5 sm:gap-3.5 ${
              isTiny ? 'px-2.5 py-1.5' : 'px-3.5 py-2'
            }`}
          >
            <div className="hidden md:block text-right border-r border-white/15 pr-3">
              <div className="text-[10px] text-slate-400 leading-none">Equipado</div>
              <div className="font-display font-bold text-xs text-white leading-tight mt-0.5 whitespace-nowrap">
                {activeCar.name} · {activeCar.drivetrain} · {activeSpecs.hp} HP
              </div>
            </div>
            <div className="hidden sm:block text-right border-r border-white/15 pr-2.5">
              <div className="text-[9px] text-slate-400 leading-none">Licenças</div>
              <div className="font-mono-num font-bold text-xs text-amber-300 leading-tight mt-0.5">
                {medalsCount}/{LICENSE_TESTS.length}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-slate-400 leading-none">Créditos</div>
              <div
                data-testid="credits-balance"
                className={`font-mono-num font-bold text-sky-300 leading-tight mt-0.5 whitespace-nowrap ${
                  isTiny ? 'text-xs' : 'text-sm'
                }`}
              >
                {save.credits.toLocaleString('pt-BR')} Cr.
              </div>
            </div>
          </div>

          {/* Easy-Access "Tela Cheia" Corner Button (Forces Horizontal on Mobile!) */}
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleFullscreen();
            }}
            aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia horizontal'}
            title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia (Horizontal)'}
            className={`min-h-[42px] rounded-xl bg-blue-700/95 hover:bg-blue-600 text-white border border-sky-300/40 shadow-md flex items-center justify-center gap-1.5 font-display font-semibold cursor-pointer transition-colors shrink-0 ${
              isTiny ? 'px-2.5 text-xs' : 'px-3.5 text-xs sm:text-sm'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="whitespace-nowrap">{isFullscreen ? 'Sair' : 'Tela Cheia'}</span>
          </button>

          {/* Audio Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={save.muted ? 'Ativar áudio' : 'Silenciar áudio'}
            className="w-[42px] h-[42px] rounded-xl bg-slate-950/80 text-white border border-white/20 hover:bg-slate-900 flex items-center justify-center cursor-pointer shrink-0"
          >
            {save.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* BOTTOM HORIZONTAL COMMAND DOCK: All Core Game Menus Immediately Playable! */}
      <div
        className={`relative z-10 w-full shrink-0 ${
          isTiny ? 'px-2.5 pb-2 space-y-1' : isCompact ? 'px-4 pb-2.5 space-y-1.5' : 'px-7 pb-5 space-y-2.5'
        }`}
      >
        {/* Active Car Compact Bar on Mobile (where top car badge is hidden) */}
        <div className="flex items-center justify-between text-[11px] text-white/85 px-1 md:hidden">
          <span className="font-display font-semibold truncate">
            {activeCar.manufacturer} {activeCar.name} ({activeCar.drivetrain} · {activeSpecs.hp} HP)
          </span>
          <span className="font-mono-num text-slate-300 shrink-0 ml-2">
            {save.ownedCarIds.length}/{CARS.length} carros
          </span>
        </div>

        {/* 6-Item Horizontal Navigation Bar */}
        <div className="pointer-events-auto grid grid-cols-3 sm:grid-cols-6 gap-1.5 md:gap-2.5 max-w-6xl mx-auto">
          {/* 1. Correr Agora (Primary Quick Start) */}
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onQuickRace();
            }}
            className={`rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/50 shadow-lg flex items-center justify-center sm:flex-col sm:items-start gap-2 sm:gap-1 transition-transform active:scale-[0.98] cursor-pointer ${
              isTiny ? 'min-h-[46px] px-2.5 py-1.5' : 'min-h-[54px] md:min-h-[72px] px-3.5 py-2.5'
            }`}
          >
            <Play className="w-4 h-4 md:w-5 md:h-5 fill-current shrink-0" />
            <div className="text-left min-w-0">
              <div className="font-display font-bold text-xs md:text-sm leading-tight truncate">
                Correr Agora
              </div>
              <div className="hidden lg:block text-[11px] text-red-100/90 leading-tight mt-0.5">
                Largada rápida
              </div>
            </div>
          </button>

          {/* 2. Modos de Jogo */}
          <button
            type="button"
            onClick={() => onNavigate('race_setup')}
            className={`hud-plate hover:bg-slate-800/95 text-white rounded-xl flex items-center justify-center sm:flex-col sm:items-start gap-2 sm:gap-1 transition-transform active:scale-[0.98] cursor-pointer ${
              isTiny ? 'min-h-[46px] px-2.5 py-1.5' : 'min-h-[54px] md:min-h-[72px] px-3.5 py-2.5'
            }`}
          >
            <Flag className="w-4 h-4 md:w-5 md:h-5 text-sky-400 shrink-0" />
            <div className="text-left min-w-0">
              <div className="font-display font-bold text-xs md:text-sm leading-tight truncate">
                Modos
              </div>
              <div className="hidden lg:block text-[11px] text-slate-300 leading-tight mt-0.5">
                IA · Time · Drift · Licenças
              </div>
            </div>
          </button>

          {/* 3. Garagem */}
          <button
            type="button"
            onClick={() => onNavigate('garage', save.selectedCarId)}
            className={`hud-plate hover:bg-slate-800/95 text-white rounded-xl flex items-center justify-center sm:flex-col sm:items-start gap-2 sm:gap-1 transition-transform active:scale-[0.98] cursor-pointer ${
              isTiny ? 'min-h-[46px] px-2.5 py-1.5' : 'min-h-[54px] md:min-h-[72px] px-3.5 py-2.5'
            }`}
          >
            <Car className="w-4 h-4 md:w-5 md:h-5 text-emerald-400 shrink-0" />
            <div className="text-left min-w-0">
              <div className="font-display font-bold text-xs md:text-sm leading-tight truncate">
                Garagem
              </div>
              <div className="hidden lg:block text-[11px] text-slate-300 leading-tight mt-0.5">
                {save.ownedCarIds.length} de {CARS.length} carros
              </div>
            </div>
          </button>

          {/* 4. Loja (Concessionária com 7 carros) */}
          <button
            type="button"
            onClick={() => onNavigate('dealership', nextUnownedCarId)}
            className={`hud-plate hover:bg-slate-800/95 text-white rounded-xl flex items-center justify-center sm:flex-col sm:items-start gap-2 sm:gap-1 transition-transform active:scale-[0.98] cursor-pointer ${
              isTiny ? 'min-h-[46px] px-2.5 py-1.5' : 'min-h-[54px] md:min-h-[72px] px-3.5 py-2.5'
            }`}
          >
            <ShoppingBag className="w-4 h-4 md:w-5 md:h-5 text-amber-400 shrink-0" />
            <div className="text-left min-w-0">
              <div className="font-display font-bold text-xs md:text-sm leading-tight truncate">
                Loja
              </div>
              <div className="hidden lg:block text-[11px] text-slate-300 leading-tight mt-0.5">
                {CARS.length} modelos 3D
              </div>
            </div>
          </button>

          {/* 5. Oficina & Customização 3D */}
          <button
            type="button"
            onClick={() => onNavigate('tuning', save.selectedCarId)}
            className={`hud-plate hover:bg-slate-800/95 text-white rounded-xl flex items-center justify-center sm:flex-col sm:items-start gap-2 sm:gap-1 transition-transform active:scale-[0.98] cursor-pointer ${
              isTiny ? 'min-h-[46px] px-2.5 py-1.5' : 'min-h-[54px] md:min-h-[72px] px-3.5 py-2.5'
            }`}
          >
            <Wrench className="w-4 h-4 md:w-5 md:h-5 text-orange-400 shrink-0" />
            <div className="text-left min-w-0">
              <div className="font-display font-bold text-xs md:text-sm leading-tight truncate">
                Oficina
              </div>
              <div className="hidden lg:block text-[11px] text-slate-300 leading-tight mt-0.5">
                Turbo, pneus, rodas e visual
              </div>
            </div>
          </button>

          {/* 6. Configurações */}
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={`hud-plate hover:bg-slate-800/95 text-white rounded-xl flex items-center justify-center sm:flex-col sm:items-start gap-2 sm:gap-1 transition-transform active:scale-[0.98] cursor-pointer ${
              isTiny ? 'min-h-[46px] px-2.5 py-1.5' : 'min-h-[54px] md:min-h-[72px] px-3.5 py-2.5'
            }`}
          >
            <Settings className="w-4 h-4 md:w-5 md:h-5 text-slate-300 shrink-0" />
            <div className="text-left min-w-0">
              <div className="font-display font-bold text-xs md:text-sm leading-tight truncate">
                Config.
              </div>
              <div className="hidden lg:block text-[11px] text-slate-300 leading-tight mt-0.5">
                Câmbio, câmera e tela
              </div>
            </div>
          </button>
        </div>

        {/* Desktop controls hint */}
        {!layout.isMobileViewport && (
          <p className="text-[11px] text-center text-white/70 font-medium tracking-wide">
            WASD / Setas Dirigir · Espaço Freio de Mão · Shift / Ctrl Marchas · C Câmera · Esc Pausar
          </p>
        )}
      </div>
    </div>
  );
};
