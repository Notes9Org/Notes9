import { describe, it, expect } from 'vitest';
import { COLLABORATOR_COLORS, getCollaboratorColor } from './colors';

describe('COLLABORATOR_COLORS', () => {
  it('contains exactly 12 distinct colors', () => {
    expect(COLLABORATOR_COLORS).toHaveLength(12);
    const unique = new Set(COLLABORATOR_COLORS);
    expect(unique.size).toBe(12);
  });
});

describe('getCollaboratorColor', () => {
  it('returns a color from the palette', () => {
    const color = getCollaboratorColor('user-123');
    expect(COLLABORATOR_COLORS).toContain(color);
  });

  it('returns the same color for the same user ID', () => {
    const color1 = getCollaboratorColor('user-abc');
    const color2 = getCollaboratorColor('user-abc');
    expect(color1).toBe(color2);
  });

  it('is deterministic across multiple calls', () => {
    const userId = 'some-uuid-v4-value';
    const results = Array.from({ length: 100 }, () => getCollaboratorColor(userId));
    expect(new Set(results).size).toBe(1);
  });

  it('handles empty string', () => {
    const color = getCollaboratorColor('');
    expect(COLLABORATOR_COLORS).toContain(color);
  });

  it('produces different colors for different user IDs', () => {
    const colors = new Set(
      ['alice', 'bob', 'charlie', 'dave', 'eve', 'frank'].map(getCollaboratorColor)
    );
    // With 6 different inputs, we expect at least some variation
    expect(colors.size).toBeGreaterThan(1);
  });
});
