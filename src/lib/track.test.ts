import { describe, it, expect } from 'vitest';
import { pickSource } from './track';

describe('pickSource — traffic attribution', () => {
  it('a campaign tag wins over everything else', () => {
    expect(pickSource({ search: '?utm_source=reddit', referrer: 'https://google.com/' })).toBe('reddit');
    expect(pickSource({ search: '?ref=instagram' })).toBe('instagram');
    expect(pickSource({ search: '?src=tiktok' })).toBe('tiktok');
  });
  it('falls back to the referring site, without the www', () => {
    expect(pickSource({ referrer: 'https://www.reddit.com/r/mealprep/comments/x' })).toBe('reddit.com');
    expect(pickSource({ referrer: 'https://t.co/abc' })).toBe('t.co');
  });
  it('our own pages are not a traffic source', () => {
    expect(pickSource({ referrer: 'https://macroforge.club/join', hostname: 'macroforge.club' })).toBe('direct');
  });
  it('no signal at all reads as direct', () => {
    expect(pickSource({})).toBe('direct');
    expect(pickSource({ search: '?utm_medium=cpc' })).toBe('direct'); // medium alone isn't a source
  });
  it('survives junk instead of throwing', () => {
    expect(pickSource({ referrer: 'not a url' })).toBe('direct');
    expect(pickSource({ search: '?utm_source=' })).toBe('direct');
  });
  it('sanitises hostile or oversized values', () => {
    expect(pickSource({ search: '?utm_source=<script>alert(1)</script>' })).toBe('scriptalert1script');
    expect(pickSource({ search: `?utm_source=${'a'.repeat(80)}` })).toHaveLength(32);
    expect(pickSource({ search: '?utm_source=Reddit' })).toBe('reddit'); // case-folded so one channel is one row
  });
});
