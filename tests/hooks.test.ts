import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePWAUpdate } from '../src/hooks';
describe('usePWAUpdate hook', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          waiting: null,
          installing: null,
          active: { state: 'activated' },
        }),
        addEventListener: vi.fn(),
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
      writable: true,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('returns updateAvailable as false initially', () => {
    const { result } = renderHook(() => usePWAUpdate());
    expect(result.current.updateAvailable).toBe(false);
  });
  it('returns update as a function', () => {
    const { result } = renderHook(() => usePWAUpdate());
    expect(typeof result.current.update).toBe('function');
  });
  it('returns registration as null initially', () => {
    const { result } = renderHook(() => usePWAUpdate());
    expect(result.current.registration).toBeNull();
  });
  it('sets updateAvailable to true when pwa-update-available fires', async () => {
    const { result } = renderHook(() => usePWAUpdate());
    act(() => {
      window.dispatchEvent(new CustomEvent('pwa-update-available'));
    });
    expect(result.current.updateAvailable).toBe(true);
  });
  it('sets registration after serviceWorker.ready resolves', async () => {
    const mockRegistration = {
      waiting: null,
      installing: null,
      active: { state: 'activated' },
      scope: '/',
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(mockRegistration),
        addEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => usePWAUpdate());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(result.current.registration).toBe(mockRegistration);
  });
  it('calls postMessage with SKIP_WAITING when update() is called with waiting SW', async () => {
    const mockPostMessage = vi.fn();
    const mockRegistration = {
      waiting: { postMessage: mockPostMessage },
      installing: null,
      active: { state: 'activated' },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(mockRegistration),
        addEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => usePWAUpdate());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    act(() => {
      result.current.update();
    });
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePWAUpdate());
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'pwa-update-available',
      expect.any(Function)
    );
  });
});
