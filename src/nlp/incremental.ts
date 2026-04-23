import { InferenceEngine, InferenceResult } from './inference';
import { EmbeddingPipeline, EmbeddingOptions } from './embeddings';

export interface IncrementalUpdateOptions extends EmbeddingOptions {
  /**
   * The minimum cosine similarity required to assign a new document to an existing topic.
   * If the highest similarity falls below this threshold, it is labeled as an outlier (-1).
   */
  similarityThreshold?: number;
}

export class IncrementalUpdater {
  /**
   * Performs a partial fit to add new documents to an existing topic model.
   * This maps new documents to existing topics without requiring a full pipeline restart,
   * minimizing computational overhead.
   *
   * @param newDocuments The array of new text documents.
   * @param topicCentroids A map of existing topic labels to their centroid embeddings.
   * @param options Configuration options.
   * @returns A promise that resolves to an array of inference results mapping each new document to a topic.
   */
  static async partialFit(
    newDocuments: string[],
    topicCentroids: Map<number, number[]>,
    options: IncrementalUpdateOptions = {}
  ): Promise<InferenceResult[]> {
    if (newDocuments.length === 0) {
      return [];
    }

    const { similarityThreshold = 0.5, ...embeddingOptions } = options;

    // 1. Embed the new documents
    const newEmbeddings = await EmbeddingPipeline.embedTexts(newDocuments, embeddingOptions);

    // 2. Map the new embeddings to the existing centroids via inference engine
    const inferenceResults = InferenceEngine.transform(newEmbeddings, topicCentroids);

    // 3. Apply the threshold to filter out low-confidence assignments
    return inferenceResults.map(result => {
      if (result.similarity < similarityThreshold) {
        return {
          label: -1,
          similarity: result.similarity
        };
      }
      return result;
    });
  }
}
