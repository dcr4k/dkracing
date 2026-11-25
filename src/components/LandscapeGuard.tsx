import React from 'react';
import { Maximize2, RotateCw, Smartphone } from 'lucide-react';

interface LandscapeGuardProps {
  onEnterFullscreenLandscape: () => void;
  onDismissForPreview: () => void;
}

export const LandscapeGuard: React.FC<LandscapeGuardProps> = ({
  onEnterFullscreenLandscape,
  onDismissForPreview,
}) => {
  return (
    <div
      data-testid="landscape-guard"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-5 text-center safe-area-hud"
      style={{
        background:
          'radial-gradient(circle at 50% 35%, rgba(22, 36, 61, 0.94) 0%, rgba(10, 17, 30, 0.98) 100%)',
      }}
    >
      <div className="max-w-xs w-full flex flex-col items-center gap-4">
        {/* Compact Apex Turismo 4 Emblem */}
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 42 24" className="w-7 h-4 shrink-0" aria-hidden="true">
            <path d="M2 13 C 10 2, 24 2, 34 8 L 28 13 C 21 8, 12 8, 6 15 Z" fill="#dc2626" />
            <path d="M8 19 C 16 10, 29 10, 40 16 L 34 21 C 26 16, 17 16, 12 22 Z" fill="#2563eb" />
          </svg>
          <span className="font-display font-bold italic text-xl tracking-tight text-white">
            APEX TURISMO <span className="text-red-500">4</span>
          </span>
        </div>

        {/* Visual Rotate Phone Indicator */}
        <div className="relative w-20 h-20 rounded-2xl bg-white/8 border border-white/15 flex items-center justify-center">
          <Smartphone className="w-10 h-10 text-sky-400 -rotate-90 transition-transform" />
          <RotateCw className="w-5 h-5 text-amber-400 absolute -top-2 -right-2 bg-slate-900 rounded-full p-0.5 border border-amber-400/50" />
        </div>

        <div className="space-y-1.5">
          <h1 className="font-display font-bold text-xl text-white">
            Jogue na Horizontal
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            Gire seu celular de lado ou toque abaixo para ativar a <strong>Tela Cheia</strong> e travar o jogo no modo paisagem.
          </p>
        </div>

        <button
          type="button"
          onClick={onEnterFullscreenLandscape}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-display font-semibold text-sm tracking-wide shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
        >
          <Maximize2 className="w-4 h-4" />
          Tela Cheia (Horizontal)
        </button>

        <button
          type="button"
          onClick={onDismissForPreview}
          className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          Continuar mesmo assim
        </button>
      </div>
    </div>
  );
};
