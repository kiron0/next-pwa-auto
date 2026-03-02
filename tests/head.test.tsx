import { cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PWAHead } from '../src/head';
describe('PWAHead component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.head.querySelectorAll('[data-pwa-auto]').forEach((el) => el.remove());
    document.head.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
    document.head
      .querySelectorAll('meta[name="apple-mobile-web-app-capable"]')
      .forEach((el) => el.remove());
    document.head
      .querySelectorAll('meta[name="apple-mobile-web-app-status-bar-style"]')
      .forEach((el) => el.remove());
    document.head
      .querySelectorAll('meta[name="mobile-web-app-capable"]')
      .forEach((el) => el.remove());
  });
  function renderPWAHead(props?: React.ComponentProps<typeof PWAHead>) {
    const { render } = require('@testing-library/react');
    render(React.createElement(PWAHead, props));
    return document.head;
  }
  it('renders manifest link with default path', () => {
    const head = renderPWAHead();
    const link = head.querySelector('link[rel="manifest"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/manifest.webmanifest');
  });
  it('renders manifest link with custom path', () => {
    const head = renderPWAHead({ manifest: '/custom.json' });
    const link = head.querySelector('link[rel="manifest"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/custom.json');
  });
  it('renders theme-color meta with default #000000', () => {
    const head = renderPWAHead();
    const meta = head.querySelector('meta[name="theme-color"]');
    expect(meta).not.toBeNull();
    expect(meta!.getAttribute('content')).toBe('#000000');
  });
  it('renders theme-color meta with custom color', () => {
    const head = renderPWAHead({ themeColor: '#ff6b35' });
    const meta = head.querySelector('meta[name="theme-color"]');
    expect(meta).not.toBeNull();
    expect(meta!.getAttribute('content')).toBe('#ff6b35');
  });
  it('renders apple-mobile-web-app-capable meta', () => {
    const head = renderPWAHead();
    const meta = head.querySelector('meta[name="apple-mobile-web-app-capable"]');
    expect(meta).not.toBeNull();
    expect(meta!.getAttribute('content')).toBe('yes');
  });
  it('renders apple-mobile-web-app-status-bar-style meta', () => {
    const head = renderPWAHead();
    const meta = head.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    expect(meta).not.toBeNull();
    expect(meta!.getAttribute('content')).toBe('default');
  });
  it('renders mobile-web-app-capable meta', () => {
    const head = renderPWAHead();
    const meta = head.querySelector('meta[name="mobile-web-app-capable"]');
    expect(meta).not.toBeNull();
    expect(meta!.getAttribute('content')).toBe('yes');
  });
  it('renders all required PWA tags in head', () => {
    const head = renderPWAHead();
    expect(head.querySelector('link[rel="manifest"]')).not.toBeNull();
    expect(head.querySelector('meta[name="theme-color"]')).not.toBeNull();
    expect(head.querySelector('meta[name="apple-mobile-web-app-capable"]')).not.toBeNull();
    expect(head.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')).not.toBeNull();
    expect(head.querySelector('meta[name="mobile-web-app-capable"]')).not.toBeNull();
  });
  it('accepts all props without error', () => {
    expect(() =>
      renderPWAHead({
        manifest: '/custom.json',
        themeColor: '#123456',
        swRegisterPath: '/custom/register.js',
        enableSW: false,
      })
    ).not.toThrow();
  });
});
