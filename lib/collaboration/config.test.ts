import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCollaborationEnabled, getCollaborationUrl } from './config';

describe('collaboration config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isCollaborationEnabled', () => {
    it('returns true when NEXT_PUBLIC_COLLABORATION_URL is set to a non-empty string', () => {
      process.env.NEXT_PUBLIC_COLLABORATION_URL = 'wss://collab.example.com';
      expect(isCollaborationEnabled()).toBe(true);
    });

    it('returns false when NEXT_PUBLIC_COLLABORATION_URL is an empty string', () => {
      process.env.NEXT_PUBLIC_COLLABORATION_URL = '';
      expect(isCollaborationEnabled()).toBe(false);
    });

    it('returns false when NEXT_PUBLIC_COLLABORATION_URL is not set', () => {
      delete process.env.NEXT_PUBLIC_COLLABORATION_URL;
      expect(isCollaborationEnabled()).toBe(false);
    });
  });

  describe('getCollaborationUrl', () => {
    it('returns the URL when NEXT_PUBLIC_COLLABORATION_URL is set', () => {
      process.env.NEXT_PUBLIC_COLLABORATION_URL = 'wss://collab.example.com';
      expect(getCollaborationUrl()).toBe('wss://collab.example.com');
    });

    it('returns empty string when NEXT_PUBLIC_COLLABORATION_URL is not set', () => {
      delete process.env.NEXT_PUBLIC_COLLABORATION_URL;
      expect(getCollaborationUrl()).toBe('');
    });

    it('returns empty string when NEXT_PUBLIC_COLLABORATION_URL is empty', () => {
      process.env.NEXT_PUBLIC_COLLABORATION_URL = '';
      expect(getCollaborationUrl()).toBe('');
    });
  });
});
