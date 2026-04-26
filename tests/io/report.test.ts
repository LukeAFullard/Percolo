import { describe, it, expect } from 'vitest';
import { ReportGenerator } from '../../src/io/report';

describe('ReportGenerator', () => {
  const mockData = {
    totalDocuments: 100,
    executionTimeMs: 1500,
    topics: [
      {
        id: 0,
        name: "space, nasa, orbit",
        size: 80,
        words: [
          { word: "space", score: 0.9 },
          { word: "nasa", score: 0.8 }
        ],
        summary: "This topic is about space exploration."
      },
      {
        id: -1,
        name: "Outlier",
        size: 20,
        words: [
          { word: "random", score: 0.1 }
        ]
      }
    ]
  };

  it('should generate valid markdown', () => {
    const md = ReportGenerator.generateMarkdown(mockData);

    expect(md).toContain('# Topic Modeling Analysis Report');
    expect(md).toContain('**Total Documents Processed:** 100');
    expect(md).toContain('**Execution Time:** 1.50 seconds');
    expect(md).toContain('### Topic 0: space, nasa, orbit');
    expect(md).toContain('- **Document Count:** 80 (80.0% of corpus)');
    expect(md).toContain('- **Summary:** This topic is about space exploration.');
    expect(md).toContain('  - space (0.9000)');

    // Check sorting (Noise should be at the end)
    const topic0Index = md.indexOf('Topic 0');
    const topicNoiseIndex = md.indexOf('Topic -1');
    expect(topic0Index).toBeLessThan(topicNoiseIndex);
  });

  it('should generate valid HTML', () => {
    const html = ReportGenerator.generateHTML(mockData);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<h1 class="text-3xl font-bold');
    expect(html).toContain('<strong>Total Documents Processed:</strong> 100');
    expect(html).toContain('<h3 class="text-xl font-medium');
  });
});
