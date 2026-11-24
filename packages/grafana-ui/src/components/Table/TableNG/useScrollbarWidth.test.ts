import { act, renderHook } from '@testing-library/react';

import { type DataGridHandle } from '@grafana/react-data-grid';

import { useScrollbarWidth } from './hooks';

/**
 * Enerview fork: useScrollbarWidth measures on panel size changes and never observes the grid,
 * so a scrollbar toggle cannot feed back into another measurement (table flickering).
 */
describe('useScrollbarWidth', () => {
  let resizeObserverSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    resizeObserverSpy = jest.spyOn(global, 'ResizeObserver');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function setup() {
    const element = document.createElement('div');
    const readClientWidth = jest.fn(() => 485);
    Object.defineProperties(element, {
      offsetWidth: { value: 500 },
      clientWidth: { get: readClientWidth },
    });
    const ref = { current: { element } as DataGridHandle };
    return {
      ...renderHook(
        ({ width, height, reserveGutter }) => useScrollbarWidth(ref, width, height, reserveGutter),
        {
          initialProps: { width: 500, height: 300, reserveGutter: true },
        }
      ),
      readClientWidth,
    };
  }

  it('measures immediately without observing the grid', () => {
    const { result, unmount } = setup();
    expect(result.current).toBe(15);
    expect(resizeObserverSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('does not remeasure on unrelated rerenders', () => {
    const { rerender, readClientWidth, unmount } = setup();
    act(() => jest.advanceTimersByTime(150));
    readClientWidth.mockClear();

    rerender({ width: 500, height: 300, reserveGutter: true });
    act(() => jest.advanceTimersByTime(150));
    expect(readClientWidth).not.toHaveBeenCalled();
    unmount();
  });

  it('remeasures when the width changes and again once the grid settles', () => {
    const { result, rerender, readClientWidth, unmount } = setup();
    readClientWidth.mockReturnValue(480);
    rerender({ width: 600, height: 300, reserveGutter: true });
    expect(result.current).toBe(20);

    readClientWidth.mockReturnValue(500);
    act(() => jest.advanceTimersByTime(150));
    expect(result.current).toBe(0);
    unmount();
  });

  it('cancels the previous measurement when the height changes', () => {
    const { result, rerender, readClientWidth, unmount } = setup();
    readClientWidth.mockReturnValue(480);
    rerender({ width: 500, height: 400, reserveGutter: true });
    expect(result.current).toBe(20);

    readClientWidth.mockClear();
    act(() => jest.advanceTimersByTime(150));
    expect(readClientWidth).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('cancels a pending measurement when unmounted', () => {
    const { readClientWidth, unmount } = setup();
    readClientWidth.mockClear();
    unmount();
    act(() => jest.advanceTimersByTime(150));
    expect(readClientWidth).not.toHaveBeenCalled();
  });

  it('remeasures immediately when gutter reservation changes', () => {
    const { result, rerender, readClientWidth, unmount } = setup();
    expect(result.current).toBe(15);
    readClientWidth.mockReturnValue(500);
    rerender({ width: 500, height: 300, reserveGutter: false });
    expect(result.current).toBe(0);
    unmount();
  });
});
