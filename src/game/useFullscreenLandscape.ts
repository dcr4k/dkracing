import { useCallback, useEffect, useState } from 'react';

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

type WebkitDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export interface FullscreenLandscapeApi {
  isFullscreen: boolean;
  enterFullscreenLandscape: () => Promise<boolean>;
  toggleFullscreen: () => Promise<void>;
}

function readIsFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDoc;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export function useFullscreenLandscape(): FullscreenLandscapeApi {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => readIsFullscreen());

  useEffect(() => {
    const sync = () => setIsFullscreen(readIsFullscreen());
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const lockLandscape = useCallback(async () => {
    try {
      const orientation = screen.orientation as LockableOrientation | undefined;
      if (orientation?.lock) {
        await orientation.lock('landscape');
      }
    } catch {
      // Orientation lock requires fullscreen on mobile browsers and is unsupported on desktop/embedded iframes
    }
  }, []);

  const enterFullscreenLandscape = useCallback(async (): Promise<boolean> => {
    try {
      const el = document.documentElement as WebkitEl;
      if (!readIsFullscreen()) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
      }
      await lockLandscape();
      setIsFullscreen(readIsFullscreen());
      return true;
    } catch {
      await lockLandscape();
      return false;
    }
  }, [lockLandscape]);

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    const doc = document as WebkitDoc;
    if (readIsFullscreen()) {
      try {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
        const orientation = screen.orientation as LockableOrientation | undefined;
        orientation?.unlock?.();
      } catch {
        // Ignore exit errors
      }
      setIsFullscreen(readIsFullscreen());
    } else {
      await enterFullscreenLandscape();
    }
  }, [enterFullscreenLandscape]);

  return {
    isFullscreen,
    enterFullscreenLandscape,
    toggleFullscreen,
  };
}
