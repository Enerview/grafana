import { throttle, set } from 'lodash';
import { useState, useRef, useEffect, RefObject, useMemo, useCallback } from 'react';

import { store } from '@grafana/data';

const MENU_MIN_WIDTH = 300;
const MAX_PERCENT = 0.35;
const COLLAPSE_THRESHOLD = 200;
export const DOCKED_MENU_SIZE_KEY = 'Enerview.user.docked.menu.size';
export const DOCKED_COLLAPSED_WIDTH = 45;
const IS_STATE_PERSISTENT = false;

const persistentStore = IS_STATE_PERSISTENT
  ? store
  : {
      exists: () => false,
      get: () => undefined,
      set: () => {},
    };

export function useResizableSidebar(): {
  sidebarWidth: number;
  resizerRef: RefObject<HTMLDivElement>;
  handleMouseDown: () => void;
  toggleSidebar: (isMinimized?: boolean) => void;
  isMinimized: boolean;
} {
  const [sidebarWidth, setSidebarWidth] = useState(DOCKED_COLLAPSED_WIDTH);
  const resizerRef = useRef<HTMLDivElement>(null);
  const isResizingSidebarRef = useRef(false);

  const handleMouseDown = () => {
    isResizingSidebarRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  };

  const saveSidebarWidthInStore = useMemo(
    () =>
      throttle((width: number) => {
        persistentStore.set(DOCKED_MENU_SIZE_KEY, width);
      }, 500),
    []
  );

  const saveSidebarWidth = useCallback(
    (width: number) => {
      setSidebarWidth(width);
      saveSidebarWidthInStore(width);
    },
    [saveSidebarWidthInStore]
  );

  const toggleSidebar = useCallback(
    (isMinimized?: boolean) => {
      const minimized = isMinimized !== undefined ? isMinimized : sidebarWidth > DOCKED_COLLAPSED_WIDTH;

      if (minimized) {
        saveSidebarWidth(DOCKED_COLLAPSED_WIDTH);
        return;
      }

      saveSidebarWidth(MENU_MIN_WIDTH);
    },
    [saveSidebarWidth, sidebarWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebarRef.current) {
        return;
      }

      const maxWidth = window.innerWidth * MAX_PERCENT;
      const mouseWidth = e.clientX;
      let newWidth = mouseWidth;

      if (mouseWidth < MENU_MIN_WIDTH) {
        newWidth = MENU_MIN_WIDTH;
      }

      if (mouseWidth < COLLAPSE_THRESHOLD) {
        newWidth = DOCKED_COLLAPSED_WIDTH;
      }

      if (mouseWidth > maxWidth) {
        newWidth = maxWidth;
      }

      saveSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizingSidebarRef.current) {
        isResizingSidebarRef.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.addEventListener('mousemove', handleMouseMove);
    };
  }, [saveSidebarWidth]);

  useEffect(() => {
    const isWidthKeyExist = persistentStore.exists(DOCKED_MENU_SIZE_KEY);

    if (isWidthKeyExist) {
      const savedWidth = persistentStore.get(DOCKED_MENU_SIZE_KEY);

      if (savedWidth) {
        setSidebarWidth(Number(savedWidth));
        return;
      }
    }

    /**
     * Collapse menu by default
     */
    setSidebarWidth(DOCKED_COLLAPSED_WIDTH);
  }, []);

  const getIsMinimized = useCallback(() => {
    return sidebarWidth < MENU_MIN_WIDTH;
  }, [sidebarWidth]);

  /**
   * Set global sidebar helpers for plugins
   */
  useEffect(() => {
    if (!window.__enerview) {
      window.__enerview = {};
    }

    set(window.__enerview, 'sidebar', {
      setMinimizedState: toggleSidebar,
      getIsMinimized,
    });
  }, [getIsMinimized, toggleSidebar]);

  return { sidebarWidth, resizerRef, handleMouseDown, isMinimized: getIsMinimized(), toggleSidebar };
}
