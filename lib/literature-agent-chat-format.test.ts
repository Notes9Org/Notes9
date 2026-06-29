import { describe, expect, it } from 'vitest';

import { formatLiteratureAssistantMarkdown } from './literature-agent-chat-format';

describe('formatLiteratureAssistantMarkdown', () => {
  it('renumbers inline citations and references by answer-source appearance', () => {
    const payload = {
      content: 'Paper B is most relevant [5]. Paper A is useful background [1].',
      structured: {
        references: [
          {
            index: 1,
            literature_review_id: 'paper-a',
            title: 'Paper A',
          },
          {
            index: 5,
            literature_review_id: 'paper-b',
            title: 'Paper B',
          },
        ],
      },
    };

    const markdown = formatLiteratureAssistantMarkdown(payload as any, 'compare');

    expect(markdown).toContain('Paper B is most relevant [1](/literature-reviews/paper-b).');
    expect(markdown).toContain('Paper A is useful background [2](/literature-reviews/paper-a).');
    expect(markdown).not.toContain('[5]');
  });
});
