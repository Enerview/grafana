import { throttle } from 'lodash';
import { useState, useRef, useEffect, RefObject, useMemo, useCallback } from 'react';

import store from '../store';

const MENU_WIDTH = 300;
const MAX_PERCENT = 0.35;
const COLLAPSE_THRESHOLD = 200;
export const DOCKED_MENU_SIZE_KEY = 'Enerview.user.docked.menu.size';
export const DOCKED_COLLAPSED_WIDTH = 45;

export function useResizableSidebar(): {
  sidebarWidth: number;
  resizerRef: RefObject<HTMLDivElement>;
  handleMouseDown: () => void;
  toggleSidebar: () => void;
} {
  const [sidebarWidth, setSidebarWidth] = useState(MENU_WIDTH);
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
        store.set(DOCKED_MENU_SIZE_KEY, width);
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

  const findElementByTestId = (testId: string): HTMLElement | null => {
    return document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  };

  const hideElement = (element: HTMLElement | null) => {
    if (element && getComputedStyle(element).display !== 'none') {
      element.style.display = 'none';
    }
  };

  const showElement = (element: HTMLElement | null) => {
    if (element && getComputedStyle(element).display === 'none') {
      element.style.display = 'block';
    }
  };

  const toggleSidebar = useCallback(() => {
    if (sidebarWidth > DOCKED_COLLAPSED_WIDTH) {
      /**
       * We can hide show elements from Variable panel directly here
       * no need add logic to observe resize on sidebar inside Variable panel
       */
      hideElement(findElementByTestId('data-testid variable-panel toggle-dock-menu-buttons'));
      hideElement(findElementByTestId('data-testid variable-panel table-view'));

      saveSidebarWidth(DOCKED_COLLAPSED_WIDTH);
      return;
    }

    if (sidebarWidth === DOCKED_COLLAPSED_WIDTH) {
      /**
       * We can hide show elements from Variable panel directly here
       * no need add logic to observe resize on sidebar inside Variable panel
       */
      showElement(findElementByTestId('data-testid variable-panel toggle-dock-menu-buttons'));
      showElement(findElementByTestId('data-testid variable-panel table-view'));

      saveSidebarWidth(MENU_WIDTH);
      return;
    }
  }, [saveSidebarWidth, sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebarRef.current) {
        return;
      }

      const maxWidth = window.innerWidth * MAX_PERCENT;
      const mouseWidth = e.clientX;
      let newWidth = mouseWidth;

      if (mouseWidth < MENU_WIDTH) {
        newWidth = MENU_WIDTH;

        showElement(findElementByTestId('data-testid variable-panel toggle-dock-menu-buttons'));
        showElement(findElementByTestId('data-testid variable-panel table-view'));
      }

      if (mouseWidth < COLLAPSE_THRESHOLD) {
        newWidth = DOCKED_COLLAPSED_WIDTH;

        hideElement(findElementByTestId('data-testid variable-panel toggle-dock-menu-buttons'));
        hideElement(findElementByTestId('data-testid variable-panel table-view'));
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
    const isWidthKeyExist = store.exists(DOCKED_MENU_SIZE_KEY);
    if (isWidthKeyExist) {
      const savedWidth = store.get(DOCKED_MENU_SIZE_KEY);

      if (savedWidth) {
        setSidebarWidth(Number(savedWidth));
      }
    }
  }, []);

  return { sidebarWidth, resizerRef, handleMouseDown, toggleSidebar };
}
