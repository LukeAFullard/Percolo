import { EmbeddingPipeline, type EmbeddingOptions } from './embeddings';
import { Similarity } from '../math/similarity';

export interface GuidedTopicModelingResult {
  /**
   * For each document, an index corresponding to the best matching seed topic,
   * or -1 if the similarity is too low (meaning it should fall back to standard HDBSCAN).
   */
  seedLabels: number[];
}

export interface GuidedTopicOptions extends EmbeddingOptions {
  /**
   * The minimum cosine similarity required for a document to be assigned a seed label.
   * If a document's similarity to all seeds is below this threshold, it is assigned -1.
   */
  similarityThreshold?: number;
}

export class GuidedTopicModeling {
  /**
   * Performs guided/seeded topic modeling by creating pseudo-documents from seed words,
   * embedding them, and finding documents that are highly similar to those seeds.
   * These labels can then be used as soft priors for HDBSCAN.
   *
   * @param documentEmbeddings The embeddings of the documents.
   * @param seedTopics A list of seed topics, where each topic is an array of strings (words).
   * @param options Options including the similarity threshold and embedding options.
   * @returns An array of seed labels (-1 for no matching seed) corresponding to each document.
   */
  static async getPriors(
    documentEmbeddings: number[][],
    seedTopics: string[][],
    options: GuidedTopicOptions = {}
  ): Promise<GuidedTopicModelingResult> {
    const { similarityThreshold = 0.5, ...embeddingOptions } = options;

    if (documentEmbeddings.length === 0 || seedTopics.length === 0) {
      return { seedLabels: new Array(documentEmbeddings.length).fill(-1) };
    }

    // Create pseudo-documents from the seed lists by joining the words
    const pseudoDocuments = seedTopics.map(topicWords => topicWords.join(' '));

    // Embed the pseudo-documents using the same pipeline
    const seedEmbeddings = await EmbeddingPipeline.embedTexts(pseudoDocuments, embeddingOptions);

    const seedLabels: number[] = [];

    for (const docEmbedding of documentEmbeddings) {
      const similarities = Similarity.cosineMultiple(docEmbedding, seedEmbeddings);

      let bestLabel = -1;
      let maxSimilarity = -Infinity;

      for (let i = 0; i < similarities.length; i++) {
        if (similarities[i] > maxSimilarity) {
          maxSimilarity = similarities[i];
          bestLabel = i; // The label is the index of the seed topic
        }
      }

      // If the best similarity is below the threshold, fall back to -1
      if (maxSimilarity < similarityThreshold) {
        seedLabels.push(-1);
      } else {
        seedLabels.push(bestLabel);
      }
    }

    return { seedLabels };
  }
}
