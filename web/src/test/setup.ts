import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Mock stores persist to localStorage; start every test from an empty browser.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
