export interface AdaptiveCameraParams {
  fovDelta: number;
  chaseDistBonus: number;
  chaseHeightBonus: number;
  showcaseRadius: number;
  showcaseSideOffset: number;
  showcaseVerticalTargetOffset: number;
}

/**
 * Computes aspect-aware camera adjustments so vehicles and road lanes remain
 * comfortably framed on vertical phones (portrait), horizontal phones (landscape),
 * and widescreen desktop monitors without cropping the car or curbs.
 */
export function computeAdaptiveCameraParams(aspect: number): AdaptiveCameraParams {
  const safeAspect = Math.max(0.35, Math.min(3.0, aspect));

  if (safeAspect < 1.0) {
    // Portrait phone (e.g., 390x844 -> aspect ~0.46)
    const portraitFactor = Math.min(1, (1.0 - safeAspect) / 0.6);
    return {
      fovDelta: 18 * portraitFactor,
      chaseDistBonus: 2.35 * portraitFactor,
      chaseHeightBonus: 0.72 * portraitFactor,
      showcaseRadius: 6.6 + 2.8 * portraitFactor,
      showcaseSideOffset: 0, // Center car horizontally on portrait screen
      showcaseVerticalTargetOffset: -1.75 * portraitFactor, // Place full car cleanly in upper viewport above bottom sheet/title CTAs
    };
  }

  if (safeAspect < 1.45) {
    // Tablet / squarish window
    const t = (1.45 - safeAspect) / 0.45;
    return {
      fovDelta: 6 * t,
      chaseDistBonus: 0.7 * t,
      chaseHeightBonus: 0.2 * t,
      showcaseRadius: 5.8 + 0.6 * t,
      showcaseSideOffset: 0.9 * (1 - t * 0.4),
      showcaseVerticalTargetOffset: 0,
    };
  }

  // Standard widescreen desktop & horizontal phones (16:9 / 19.5:9)
  return {
    fovDelta: 0,
    chaseDistBonus: 0,
    chaseHeightBonus: 0,
    showcaseRadius: 5.8,
    showcaseSideOffset: 1.15,
    showcaseVerticalTargetOffset: 0,
  };
}
