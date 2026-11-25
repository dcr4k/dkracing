import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Compass, Minus, Plus } from 'lucide-react';
import { TouchControlState } from '../game/sceneEngine';
import { SteeringMode, TransmissionMode } from '../game/types';

export type GyroPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

interface TouchControlsProps {
  transmission: TransmissionMode;
  steeringMode: SteeringMode;
  gyroPermissionState: GyroPermissionState;
  compactLandscape: boolean;
  onRequestGyroPermission: () => void;
  onTouchChange: (partial: Partial<TouchControlState>) => void;
  onShift: (dir: 1 | -1) => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  transmission,
  steeringMode,
  gyroPermissionState,
  compactLandscape,
  onRequestGyroPermission,
  onTouchChange,
  onShift,
}) => {
  const [active, setActive] = useState({
    steerLeft: false,
    steerRight: false,
    throttle: false,
    brake: false,
    handbrake: false,
  });

  // Virtual wheel state (-1 right .. +1 left)
  const [wheelSteer, setWheelSteer] = useState<number>(0);
  const wheelDraggingRef = useRef<boolean>(false);
  const wheelCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const wheelStartAngleRef = useRef<number>(0);

  // Gyroscope tilt readout (-1 right .. +1 left)
  const [gyroSteer, setGyroSteer] = useState<number>(0);

  // Clear steering analog when switching steering modes
  useEffect(() => {
    setWheelSteer(0);
    setGyroSteer(0);
    onTouchChange({ steerLeft: false, steerRight: false, steerAnalog: null });
  }, [steeringMode, onTouchChange]);

  // Live DeviceOrientation listener when Gyroscope mode is active and permitted
  useEffect(() => {
    if (steeringMode !== 'gyro') return;
    if (gyroPermissionState === 'prompt' || gyroPermissionState === 'denied' || gyroPermissionState === 'unsupported') {
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const beta = typeof e.beta === 'number' ? e.beta : 0;
      const gamma = typeof e.gamma === 'number' ? e.gamma : 0;

      // Determine landscape orientation angle (90 = left-landscape, 270/-90 = right-landscape)
      const screenAngle =
        typeof window.screen?.orientation?.angle === 'number'
          ? window.screen.orientation.angle
          : typeof (window as unknown as { orientation?: number }).orientation === 'number'
            ? ((window as unknown as { orientation: number }).orientation ?? 0)
            : 90;

      let rawTiltDeg = 0;
      if (screenAngle === 90) {
        rawTiltDeg = -beta; // tilt top-left -> positive steer (+left)
      } else if (screenAngle === 270 || screenAngle === -90) {
        rawTiltDeg = beta;
      } else {
        rawTiltDeg = -gamma;
      }

      // Deadzone of 3.5 deg, full lock at 30 deg
      const deadzone = 3.5;
      const maxDeg = 30;
      let norm = 0;
      if (Math.abs(rawTiltDeg) > deadzone) {
        const sign = rawTiltDeg > 0 ? 1 : -1;
        norm = sign * Math.min(1, (Math.abs(rawTiltDeg) - deadzone) / (maxDeg - deadzone));
      }

      setGyroSteer(norm);
      onTouchChange({ steerAnalog: norm });
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      onTouchChange({ steerAnalog: null });
    };
  }, [steeringMode, gyroPermissionState, onTouchChange]);

  const bindHold = (key: 'steerLeft' | 'steerRight' | 'throttle' | 'brake' | 'handbrake') => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setActive((prev) => ({ ...prev, [key]: true }));
      onTouchChange({ [key]: true });
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setActive((prev) => ({ ...prev, [key]: false }));
      onTouchChange({ [key]: false });
    },
    onPointerCancel: () => {
      setActive((prev) => ({ ...prev, [key]: false }));
      onTouchChange({ [key]: false });
    },
    onLostPointerCapture: () => {
      setActive((prev) => ({ ...prev, [key]: false }));
      onTouchChange({ [key]: false });
    },
  });

  // Virtual Steering Wheel pointer handlers
  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    wheelCenterRef.current = { x: cx, y: cy };
    wheelStartAngleRef.current = Math.atan2(e.clientY - cy, e.clientX - cx);
    wheelDraggingRef.current = true;
    // Allow immediate horizontal nudge from center as well
    const dxNorm = Math.max(-1, Math.min(1, (cx - e.clientX) / (rect.width * 0.48)));
    if (Math.abs(dxNorm) > 0.14) {
      setWheelSteer(dxNorm);
      onTouchChange({ steerAnalog: dxNorm });
    }
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wheelDraggingRef.current) return;
    e.preventDefault();
    const { x: cx, y: cy } = wheelCenterRef.current;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    let delta = angle - wheelStartAngleRef.current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    // Combine rotational drag + intuitive horizontal slide for thumb comfort on phones
    const radialSteer = -delta / 1.15;
    const horizSteer = (cx - e.clientX) / 56;
    const blended = Math.max(-1, Math.min(1, radialSteer * 0.65 + horizSteer * 0.55));
    setWheelSteer(blended);
    onTouchChange({ steerAnalog: blended });
  };

  const releaseWheel = () => {
    if (!wheelDraggingRef.current) return;
    wheelDraggingRef.current = false;
    setWheelSteer(0);
    onTouchChange({ steerAnalog: null });
  };

  const steerSize = compactLandscape ? 'w-14 h-14' : 'w-16 h-16';
  const brakeSize = compactLandscape ? 'w-14 h-14' : 'w-16 h-16';
  const gasSize = compactLandscape ? 'w-16 h-20' : 'w-[70px] h-24';
  const wheelPx = compactLandscape ? 104 : 124;

  return (
    <div className="pointer-events-none flex items-end justify-between w-full gap-2">
      {/* Left Thumb Cluster: Handbrake + Steering (Buttons / Virtual Wheel / Gyroscope) */}
      <div className="pointer-events-auto flex flex-col items-start gap-2">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Freio de mão"
          {...bindHold('handbrake')}
          className={`touch-pad h-10 px-3.5 rounded-xl font-display font-bold text-xs tracking-wide border transition-transform select-none cursor-pointer ${
            active.handbrake
              ? 'bg-amber-500 border-amber-300 text-slate-950 scale-95'
              : 'bg-slate-950/80 border-white/25 text-amber-300'
          }`}
        >
          MÃO
        </button>

        {steeringMode === 'buttons' && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Virar à esquerda"
              {...bindHold('steerLeft')}
              className={`touch-pad ${steerSize} rounded-2xl flex items-center justify-center border transition-transform select-none cursor-pointer ${
                active.steerLeft
                  ? 'bg-sky-500 border-sky-200 text-slate-950 scale-95'
                  : 'bg-slate-950/80 border-white/25 text-white'
              }`}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Virar à direita"
              {...bindHold('steerRight')}
              className={`touch-pad ${steerSize} rounded-2xl flex items-center justify-center border transition-transform select-none cursor-pointer ${
                active.steerRight
                  ? 'bg-sky-500 border-sky-200 text-slate-950 scale-95'
                  : 'bg-slate-950/80 border-white/25 text-white'
              }`}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </div>
        )}

        {steeringMode === 'wheel' && (
          <div
            role="slider"
            aria-label="Volante virtual"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(-wheelSteer * 100)}
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={releaseWheel}
            onPointerCancel={releaseWheel}
            onLostPointerCapture={releaseWheel}
            style={{ width: wheelPx, height: wheelPx }}
            className="touch-pad relative rounded-full bg-slate-950/75 border border-white/25 flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
          >
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full p-1.5 transition-transform duration-75"
              style={{ transform: `rotate(${-wheelSteer * 120}deg)` }}
            >
              {/* Outer Rim */}
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="#1e293b"
                strokeWidth="12"
              />
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="#cbd5e1"
                strokeOpacity="0.45"
                strokeWidth="1.5"
              />
              {/* Red Motorsport Top-Center Stripe */}
              <rect x="56" y="6" width="8" height="12" rx="2" fill="#ef4444" />
              {/* 3 Metallic Racing Spokes */}
              <line x1="16" y1="60" x2="48" y2="60" stroke="#94a3b8" strokeWidth="8" strokeLinecap="round" />
              <line x1="72" y1="60" x2="104" y2="60" stroke="#94a3b8" strokeWidth="8" strokeLinecap="round" />
              <line x1="60" y1="72" x2="60" y2="104" stroke="#94a3b8" strokeWidth="8" strokeLinecap="round" />
              {/* Center Horn Hub */}
              <circle cx="60" cy="60" r="15" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
              <text
                x="60"
                y="63.5"
                textAnchor="middle"
                fontSize="10"
                fontFamily="Chakra Petch, sans-serif"
                fontWeight="700"
                fill="#f8fafc"
              >
                GT
              </text>
            </svg>
          </div>
        )}

        {steeringMode === 'gyro' && (
          <div className="hud-plate rounded-xl px-3 py-2 flex flex-col gap-1.5 min-w-[132px]">
            <div className="flex items-center justify-between gap-2 text-[10px] font-display font-bold text-sky-300">
              <span className="inline-flex items-center gap-1">
                <Compass className="w-3.5 h-3.5" />
                GIROSCÓPIO
              </span>
              <span className="font-mono-num text-white/80">
                {Math.round(-gyroSteer * 100)}%
              </span>
            </div>

            {gyroPermissionState === 'prompt' ? (
              <button
                type="button"
                onClick={onRequestGyroPermission}
                className="min-h-[34px] px-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-display font-bold cursor-pointer"
              >
                Ativar Sensor iOS
              </button>
            ) : gyroPermissionState === 'denied' ? (
              <div className="text-[10px] text-amber-300">Permissão negada no aparelho</div>
            ) : (
              <div className="relative h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30" />
                <div
                  className="absolute top-0.5 bottom-0.5 w-4 rounded-full bg-sky-400 transition-[left] duration-75"
                  style={{ left: `calc(${50 - gyroSteer * 44}% - 8px)` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Thumb Cluster: Optional Manual Shift Paddles + Brake & Throttle Pedals */}
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {transmission === 'manual' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Reduzir marcha"
              onPointerDown={(e) => {
                e.preventDefault();
                onShift(-1);
              }}
              className="touch-pad w-12 h-11 rounded-xl bg-slate-950/82 border border-white/25 text-white active:bg-blue-600 flex items-center justify-center cursor-pointer"
            >
              <Minus className="w-5 h-5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Subir marcha"
              onPointerDown={(e) => {
                e.preventDefault();
                onShift(1);
              }}
              className="touch-pad w-12 h-11 rounded-xl bg-slate-950/82 border border-white/25 text-white active:bg-blue-600 flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Freiar ou ré"
            {...bindHold('brake')}
            className={`touch-pad ${brakeSize} rounded-2xl flex flex-col items-center justify-center border font-display font-bold text-xs tracking-wider transition-transform select-none cursor-pointer ${
              active.brake
                ? 'bg-red-600 border-red-300 text-white scale-95'
                : 'bg-slate-950/82 border-red-400/55 text-red-300'
            }`}
          >
            <span>FREIO</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Acelerar"
            {...bindHold('throttle')}
            className={`touch-pad ${gasSize} rounded-2xl flex flex-col items-center justify-center border font-display font-bold text-xs tracking-wider transition-transform select-none cursor-pointer ${
              active.throttle
                ? 'bg-blue-600 border-sky-300 text-white scale-95'
                : 'bg-slate-950/82 border-sky-400/60 text-sky-300'
            }`}
          >
            <span>ACEL</span>
          </button>
        </div>
      </div>
    </div>
  );
};
