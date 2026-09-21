import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('createApp scaffold', () => {
  it('returns a ready placeholder until Express is wired', () => {
    expect(createApp().ready).toBe(true);
  });
});
