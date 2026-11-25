import React from 'react';
import { Award, Flag, Play, RotateCcw } from 'lucide-react';
import { formatTime } from '../game/progression';
import { MedalType, SessionResult } from '../game/types';

interface RaceModalProps {
  kind: 'paused' | 'result';
  result?: SessionResult | null;
  onResume: () => void;
  onRestart: () => void;
  onBackToMenu: () => void;
}

const MEDAL_LABELS: Record<MedalType, { label: string; color: string }> = {
  gold: { label: 'Medalha de Ouro', color: '#ca8a04' },
  silver: { label: 'Medalha de Prata', color: '#64748b' },
  bronze: { label: 'Medalha de Bronze', color: '#b45309' },
  none: { label: 'Sem Medalha', color: '#64748b' },
};

export const RaceModal: React.FC<RaceModalProps> = ({
  kind,
  result,
  onResume,
  onRestart,
  onBackToMenu,
}) => {
  if (kind === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4">
        <div className="gt-panel rounded-2xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900">Corrida Pausada</h2>
            <p className="text-xs text-slate-600 mt-1">
              WASD / Setas ou Toque na tela · Espaço freio de mão · Shift/Ctrl marchas · C câmera · R reiniciar
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={onResume}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-display font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              Continuar Corrida
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-display font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reiniciar Sessão
            </button>
            <button
              type="button"
              onClick={onBackToMenu}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-semibold text-sm cursor-pointer"
            >
              Voltar ao GT Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;
  const medalInfo = result.medal ? MEDAL_LABELS[result.medal] : null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-3 sm:p-4">
      <div className="gt-panel rounded-2xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-blue-700">{result.subtitle}</div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900 mt-0.5">
              {result.title}
            </h2>
            {result.failReason && (
              <p className="text-xs font-medium text-red-600 mt-1">{result.failReason}</p>
            )}
          </div>
          <div className="w-11 h-11 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            {result.mode === 'license' ? (
              <Award
                className="w-6 h-6"
                style={{ color: medalInfo?.color ?? '#64748b' }}
              />
            ) : (
              <Flag className="w-6 h-6 text-blue-700" />
            )}
          </div>
        </div>

        {/* Frozen Run Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3">
            <div className="text-[11px] text-slate-500">Tempo Total</div>
            <div className="font-mono-num font-bold text-sm sm:text-base text-slate-900 mt-0.5">
              {formatTime(result.totalTime)}
            </div>
          </div>

          {result.mode === 'license' ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3">
              <div className="text-[11px] text-slate-500">Resultado</div>
              <div
                className="font-display font-bold text-sm mt-0.5"
                style={{ color: medalInfo?.color ?? '#475569' }}
              >
                {medalInfo?.label ?? 'Concluído'}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3">
              <div className="text-[11px] text-slate-500">Melhor Volta</div>
              <div className="font-mono-num font-bold text-sm sm:text-base text-slate-900 mt-0.5">
                {formatTime(result.bestLapTime)}
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 sm:p-3 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-blue-700">Prêmio</div>
            <div className="font-mono-num font-bold text-sm sm:text-base text-blue-900 mt-0.5">
              +{result.creditsEarned.toLocaleString('pt-BR')} Cr.
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-display font-semibold text-sm cursor-pointer"
          >
            {result.mode === 'license' ? 'Tentar Novamente' : 'Correr Novamente'}
          </button>
          <button
            type="button"
            onClick={onBackToMenu}
            className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-display font-semibold text-sm cursor-pointer"
          >
            Voltar ao GT Mode
          </button>
        </div>
      </div>
    </div>
  );
};
