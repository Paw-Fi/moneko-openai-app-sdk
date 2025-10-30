import { describe, it, expect } from 'vitest';
import { mapUserMessage, normalizeError } from '../lib/errors.js';

describe('Error Handling', () => {
  describe('mapUserMessage', () => {
    it('should map 400 errors', () => {
      const msg = mapUserMessage(400, 'Bad request');
      expect(msg).toContain('couldn\'t process');
      expect(msg).toContain('required fields');
    });

    it('should map 403 errors', () => {
      const msg = mapUserMessage(403, 'Forbidden');
      expect(msg).toContain('permission');
    });

    it('should map 404 errors', () => {
      const msg = mapUserMessage(404, 'Not found');
      expect(msg).toContain('couldn\'t find');
    });

    it('should map 429 errors', () => {
      const msg = mapUserMessage(429, 'Too many requests');
      expect(msg).toContain('Too many requests');
    });

    it('should map 500+ errors', () => {
      const msg = mapUserMessage(500, 'Internal error');
      expect(msg).toContain('went wrong');
    });

    it('should handle unknown status codes', () => {
      const msg = mapUserMessage(418, 'I\'m a teapot');
      expect(msg).toContain('I\'m a teapot');
    });
  });

  describe('normalizeError', () => {
    it('should create error from string payload', () => {
      const error = normalizeError(400, 'Bad request');
      expect(error.message).toContain('couldn\'t process');
      expect((error as any).status).toBe(400);
      expect((error as any).details).toBe('Bad request');
    });

    it('should create error from object payload with error field', () => {
      const payload = { error: 'Invalid input' };
      const error = normalizeError(400, payload);
      expect(error.message).toContain('couldn\'t process');
      expect((error as any).details).toEqual(payload);
    });

    it('should create error from object payload with message field', () => {
      const payload = { message: 'Something went wrong' };
      const error = normalizeError(500, payload);
      expect(error.message).toContain('went wrong');
      expect((error as any).details).toEqual(payload);
    });

    it('should handle object payload without error/message', () => {
      const payload = { code: 'ERR_UNKNOWN' };
      const error = normalizeError(500, payload);
      expect(error.message).toContain('went wrong');
      expect((error as any).details).toEqual(payload);
    });
  });
});
