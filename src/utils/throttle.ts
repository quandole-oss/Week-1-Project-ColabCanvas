/* eslint-disable @typescript-eslint/no-explicit-any */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          func.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
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
