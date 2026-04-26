import { EmbeddingPipeline, type EmbeddingOptions } from './embeddings';
import { Similarity } from '../math/similarity';

export interface ZeroShotResult {
  label: string;
  similarity: number;
}

export class ZeroShotClassifier {
  /**
   * Performs zero-shot classification of documents into custom categories.
   * Re-uses the existing `EmbeddingPipeline` to embed the category labels.
   *
   * @param documentEmbeddings The embeddings of the documents to classify.
   * @param categoryLabels The custom category labels (e.g. ["sports", "politics"]).
   * @param options The embedding options to pass to `EmbeddingPipeline`.
   * @returns An array of ZeroShotResult, where each element corresponds to a document
   *          and contains the assigned category label and cosine similarity score.
   */
  static async classify(
    documentEmbeddings: number[][],
    categoryLabels: string[],
    options: EmbeddingOptions = {}
  ): Promise<ZeroShotResult[]> {
    if (documentEmbeddings.length === 0 || categoryLabels.length === 0) {
      return [];
    }

    // Embed the category labels using the same pipeline as the documents
    const categoryEmbeddings = await EmbeddingPipeline.embedTexts(categoryLabels, options);

    const results: ZeroShotResult[] = [];

    for (const docEmbedding of documentEmbeddings) {
      const similarities = Similarity.cosineMultiple(docEmbedding, categoryEmbeddings);

      let bestLabel = '';
      let maxSimilarity = -Infinity;

      for (let i = 0; i < similarities.length; i++) {
        if (similarities[i] > maxSimilarity) {
          maxSimilarity = similarities[i];
          bestLabel = categoryLabels[i];
        }
      }

      results.push({
        label: bestLabel,
        similarity: maxSimilarity
      });
    }

    return results;
  }
}
