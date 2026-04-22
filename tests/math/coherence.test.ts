import { describe, it, expect } from 'vitest';
import { CoherenceMetrics } from '../../src/math/coherence';

describe('CoherenceMetrics Module', () => {
  it('should calculate NPMI correctly for coherent and incoherent topics', () => {
    // A simple corpus of 4 documents
    const tokenizedDocuments = [
      ["apple", "banana", "fruit", "tasty"],
      ["apple", "fruit", "red"],
      ["car", "engine", "drive", "fast"],
      ["car", "wheels", "drive", "road"]
    ];

    // Topic 1: highly coherent (appears together in doc 3 and 4)
    // Topic 2: highly coherent (appears together in doc 1 and 2)
    // Topic 3: incoherent (never appear together)
    const topWordsPerTopic = [
      ["car", "drive"],
      ["apple", "fruit"],
      ["apple", "car"]
    ];

    const result = CoherenceMetrics.calculateNPMI(topWordsPerTopic, tokenizedDocuments);

    expect(result.topicScores.length).toBe(3);

    // Topic 1 ("car", "drive") - Both appear in doc 3 and doc 4.
    // Freq("car") = 2, Freq("drive") = 2, Freq("car", "drive") = 2
    // P(w1) = 2/4 = 0.5. P(w2) = 0.5. P(w1, w2) = 0.5
    // PMI = log(0.5 / (0.5 * 0.5)) = log(2)
    // NPMI = log(2) / -log(0.5) = log(2) / log(2) = 1.0 (perfect coherence)
    expect(result.topicScores[0]).toBeCloseTo(1.0, 5);

    // Topic 2 ("apple", "fruit") - Both appear in doc 1 and doc 2.
    // Freq = 2 for both and pair. NPMI should be 1.0
    expect(result.topicScores[1]).toBeCloseTo(1.0, 5);

    // Topic 3 ("apple", "car") - Never appear together.
    // Freq pair = 0. NPMI should be -1.0
    expect(result.topicScores[2]).toBe(-1.0);

    // Mean score: (1.0 + 1.0 - 1.0) / 3 = 1/3 = 0.3333...
    expect(result.meanScore).toBeCloseTo(1/3, 5);
  });

  it('should handle edge cases like empty inputs gracefully', () => {
    const result1 = CoherenceMetrics.calculateNPMI([], [["apple"]]);
    expect(result1.topicScores.length).toBe(0);
    expect(result1.meanScore).toBe(0);

    const result2 = CoherenceMetrics.calculateNPMI([["apple", "banana"]], []);
    expect(result2.topicScores.length).toBe(0);
    expect(result2.meanScore).toBe(0);
  });
});
