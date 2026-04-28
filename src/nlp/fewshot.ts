import { EmbeddingPipeline, type EmbeddingOptions } from './embeddings';
import { Similarity } from '../math/similarity';
import { Centroids } from '../math/centroids';

export interface FewShotResult {
  label: string;
  similarity: number;
}

export class FewShotClassifier {
  /**
   * Performs few-shot classification of documents into custom categories using provided examples.
   * Embeds the examples to create category centroids, then assigns documents via cosine similarity.
   *
   * @param documentEmbeddings The embeddings of the documents to classify.
   * @param categoriesMap A map where keys are category labels and values are arrays of example texts.
   * @param options The embedding options to pass to `EmbeddingPipeline`.
   */
  static async classify(
    documentEmbeddings: number[][],
    categoriesMap: Record<string, string[]>,
    options: EmbeddingOptions = {}
  ): Promise<FewShotResult[]> {
    if (documentEmbeddings.length === 0 || Object.keys(categoriesMap).length === 0) {
      return [];
    }

    const categoryLabels = Object.keys(categoriesMap);
    const categoryCentroids: number[][] = [];

    // Embed all examples and compute centroids for each category
    for (const label of categoryLabels) {
        const examples = categoriesMap[label];
        if (!examples || examples.length === 0) {
            // Fallback to zero-shot if no examples provided
            const fallback = await EmbeddingPipeline.embedTexts([label], options);
            categoryCentroids.push(fallback[0]);
            continue;
        }

        const exampleEmbeddings = await EmbeddingPipeline.embedTexts(examples, options);
        // Compute average embedding (centroid) for the category
        // Local Centroids expects an array of embeddings and a matching array of labels (0 for all here)
        const mockLabels = new Array(exampleEmbeddings.length).fill(0);
        const centroidMap = Centroids.calculate(exampleEmbeddings, mockLabels);
        categoryCentroids.push(centroidMap.get(0)!);
    }

    const results: FewShotResult[] = [];

    for (const docEmbedding of documentEmbeddings) {
      const similarities = Similarity.cosineMultiple(docEmbedding, categoryCentroids);

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
