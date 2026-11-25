import { useEffect, useState } from 'react';

export interface ViewportLayout {
  width: number;
  height: number;
  isPortrait: boolean;
  isCompactLandscape: boolean;
  isMobileViewport: boolean;
  isCoarsePointer: boolean;
}

function readViewport(): ViewportLayout {
  if (typeof window === 'undefined') {
    return {
      width: 1440,
      height: 900,
      isPortrait: false,
      isCompactLandscape: false,
      isMobileViewport: false,
      isCoarsePointer: false,
    };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isPortrait = height > width;
  const isCompactLandscape = width >= height && height <= 520;
  const isCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const isMobileViewport = width <= 920 || height <= 520 || isCoarsePointer;

  return {
    width,
    height,
    isPortrait,
    isCompactLandscape,
    isMobileViewport,
    isCoarsePointer,
  };
}

export function useViewportLayout(): ViewportLayout {
  const [layout, setLayout] = useState<ViewportLayout>(() => readViewport());

  useEffect(() => {
    const update = () => setLayout(readViewport());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return layout;
}
