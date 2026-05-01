import { useCallback, useRef } from 'react';

interface Options {
  delay?: number;
  shouldPreventDefault?: boolean;
}

export const useLongPress = (
  callback: (e: any) => void,
  { delay = 500, shouldPreventDefault = true }: Options = {}
) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const targetRef = useRef<EventTarget | null>(null);

  const start = useCallback(
    (event: any) => {
      if (shouldPreventDefault && event.target) {
        event.persist?.();
        targetRef.current = event.target;
      }

      timeoutRef.current = setTimeout(() => {
        callback(event);
      }, delay);
    },
    [callback, delay, shouldPreventDefault]
  );

  const clear = useCallback(
    (event: any, shouldTrigger = false) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    },
    []
  );

  return {
    onMouseDown: (e: any) => start(e),
    onTouchStart: (e: any) => start(e),
    onMouseUp: (e: any) => clear(e),
    onMouseLeave: (e: any) => clear(e),
    onTouchMove: (e: any) => clear(e),
    onTouchEnd: (e: any) => clear(e),
  };
};
