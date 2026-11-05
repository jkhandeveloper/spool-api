import { clampSummary } from './summary.types.js';
import { LocalSummaryProvider } from './local-summary.provider.js';
import { deriveTitle } from '../journal/journal.service.js';

describe('clampSummary', () => {
  it('trims lists and long text to the stored limits', () => {
    const out = clampSummary({
      title: '  ',
      topics: ['a', 'b', 'c', 'd'],
      mainPoints: [' one ', '', 'two'],
      takeaways: ['x'.repeat(500)],
      dailyGoal: 'd',
      weeklyGoal: 'w',
    });
    expect(out.title).toBe('Your session');
    expect(out.topics).toEqual(['a', 'b', 'c']);
    expect(out.mainPoints).toEqual(['one', 'two']);
    expect(out.takeaways[0]).toHaveLength(400);
  });
});

describe('LocalSummaryProvider', () => {
  it('produces a summary from the transcript', async () => {
    const out = await new LocalSummaryProvider().summarize({
      transcript: 'Short. This is a much longer sentence about work stress.',
      prompts: ['Work stress'],
    });
    expect(out.title).toBe('Work stress');
    expect(out.mainPoints).toEqual([
      'This is a much longer sentence about work stress.',
    ]);
  });
});

describe('deriveTitle', () => {
  it('uses the first non-empty line, truncated', () => {
    expect(deriveTitle('\n  Hello there \nmore')).toBe('Hello there');
    expect(deriveTitle('x'.repeat(80))).toHaveLength(60);
  });
});
