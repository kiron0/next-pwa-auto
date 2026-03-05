import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateMock = vi.fn();

const hookState = {
  updateAvailable: false,
  update: updateMock,
  registration: null,
};

vi.mock('../src/hooks', () => ({
  default: vi.fn(() => hookState),
}));

import PWAHead from '../src/head';

describe('PWAHead update UI', () => {
  beforeEach(() => {
    hookState.updateAvailable = false;
    updateMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not render update UI unless enableUpdateUI is true', () => {
    hookState.updateAvailable = true;
    render(React.createElement(PWAHead));
    expect(screen.queryByText('A new version is available.')).toBeNull();
  });

  it('renders update action when update is available and enableUpdateUI is true', () => {
    hookState.updateAvailable = true;
    render(React.createElement(PWAHead, { enableUpdateUI: true }));

    expect(screen.getByText('A new version is available.')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('renders install action when beforeinstallprompt is fired', async () => {
    render(React.createElement(PWAHead, { enableUpdateUI: true }));

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const installEvent = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    Object.defineProperty(installEvent, 'prompt', { value: promptMock });
    Object.defineProperty(installEvent, 'userChoice', {
      value: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    });

    window.dispatchEvent(installEvent);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Install' })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalledTimes(1);
    });
  });
});
