import { throttle } from 'lodash';
import { useState, useRef, useEffect, RefObject, useLayoutEffect, useMemo } from 'react';

import store from '../store';

const MENU_WIDTH = 300;
const MAX_PERCENT = 0.35;
export const DOCKED_MENU_SIZE_KEY = 'Enerview.user.docked.menu.size';

export function useResizableSidebar(): {
  sidebarWidth: number;
  resizerRef: RefObject<HTMLDivElement>;
  handleMouseDown: () => void;
} {
  const [sidebarWidth, setSidebarWidth] = useState(MENU_WIDTH);
  const resizerRef = useRef<HTMLDivElement>(null);
  const isResizingSidebarRef = useRef(false);

  const handleMouseDown = () => {
    isResizingSidebarRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  };

  const saveSidebarWidth = useMemo(
    () =>
      throttle((width: number) => {
        console.log('store.set(DOCKED_MENU_SIZE_KEY, width) ->', width);
        store.set(DOCKED_MENU_SIZE_KEY, width);
      }, 500),
    []
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebarRef.current) {
        return;
      }
      const maxWidth = window.innerWidth * MAX_PERCENT;
      let newWidth = e.clientX;
      if (newWidth < MENU_WIDTH) {
        newWidth = MENU_WIDTH;
      }
      if (newWidth > maxWidth) {
        newWidth = maxWidth;
      }
      setSidebarWidth(newWidth);
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
        setSidebarWidth(savedWidth);
      }
    }
  }, []);

  return { sidebarWidth, resizerRef, handleMouseDown };
}
