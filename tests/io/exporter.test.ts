import { describe, it, expect } from 'vitest';
import { Exporter, PipelineResult } from '../../src/io/exporter';

describe('Exporter', () => {
  const mockResult: PipelineResult = {
    documents: [
      { text: 'I love space and stars.', topicLabel: 0, probability: 0.95, sentiment: 0.8 },
      { text: 'Elections are approaching.', topicLabel: 1, probability: 0.85, sentiment: -0.2 },
      { text: 'The, quick, brown, fox\njumped over the lazy dog.', topicLabel: -1, probability: 0.1 },
    ],
    topics: [
      { label: 0, name: '0_space_stars', size: 1, words: ['space', 'stars'] },
      { label: 1, name: '1_elections_voting', size: 1, words: ['elections', 'voting'] },
    ]
  };

  it('should export to JSON correctly', () => {
    const jsonStr = Exporter.toJSON(mockResult);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.documents).toHaveLength(3);
    expect(parsed.topics).toHaveLength(2);
    expect(parsed.documents[0].topicLabel).toBe(0);
  });

  it('should export to CSV correctly and escape special characters', () => {
    const csvStr = Exporter.toCSV(mockResult);

    // We split by newline, but need to be careful because the CSV itself contains a newline in the last row.
    // So we just check the string contents directly instead of splitting by newline blindly.
    expect(csvStr).toContain('Document,Topic,Probability,Sentiment');
    expect(csvStr).toContain('"I love space and stars.",0,0.95,0.8');
    expect(csvStr).toContain('"The, quick, brown, fox\njumped over the lazy dog.",-1,0.1,');
  });

  it('should export to RAG-ready format correctly', () => {
    const ragStr = Exporter.toRAGReady(mockResult);
    const parsed = JSON.parse(ragStr);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].pageContent).toBe('I love space and stars.');
    expect(parsed[0].metadata.topic_name).toBe('0_space_stars');
    expect(parsed[0].metadata.topic_words).toEqual(['space', 'stars']);
    expect(parsed[0].metadata.sentiment).toBe(0.8);

    // Check fallback for unknown topic (noise -1)
    expect(parsed[2].metadata.topic_name).toBe('Unknown Topic');
  });
});
