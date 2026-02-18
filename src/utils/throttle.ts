/* eslint-disable @typescript-eslint/no-explicit-any */
export type ThrottledFunction<T extends (...args: any[]) => any> =
  ((...args: Parameters<T>) => void) & { flush: () => void };

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ThrottledFunction<T> {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const throttled = function (this: any, ...args: Parameters<T>) {
    lastThis = this;
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      timerId = setTimeout(() => {
        inThrottle = false;
        timerId = null;
        if (lastArgs) {
          func.apply(lastThis, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  } as ThrottledFunction<T>;

  throttled.flush = function () {
    if (lastArgs) {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      inThrottle = false;
      func.apply(lastThis, lastArgs);
      lastArgs = null;
    }
  };

  return throttled;
}

export type DebouncedFunction<T extends (...args: any[]) => any> =
  ((...args: Parameters<T>) => void) & { flush: () => void };

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;

  const debounced = function (this: any, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func.apply(lastThis, lastArgs!);
      timeout = null;
      lastArgs = null;
    }, wait);
  } as DebouncedFunction<T>;

  debounced.flush = function () {
    if (timeout && lastArgs) {
      clearTimeout(timeout);
      func.apply(lastThis, lastArgs);
      timeout = null;
      lastArgs = null;
    }
  };

  return debounced;
}
