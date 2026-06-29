import { describe, expect, it } from 'vitest';

import { formatLiteratureAssistantMarkdown } from './literature-agent-chat-format';

describe('formatLiteratureAssistantMarkdown live preview mode', () => {
  it('preserves raw citation labels when renumbering is disabled', () => {
    const markdown = formatLiteratureAssistantMarkdown(
      {
        role: 'assistant',
        content: 'Preview cites [5]. Then [1].',
        answer: 'Preview cites [5]. Then [1].',
        structured: {
          references: [
            { index: 5, literature_review_id: 'paper-a' },
            { index: 1, literature_review_id: 'paper-b' },
          ],
        },
      },
      'biomni',
      { renumberCitations: false }
    );

    expect(markdown).toContain('[5](/literature-reviews/paper-a).');
    expect(markdown).toContain('[1](/literature-reviews/paper-b).');
  });
});
