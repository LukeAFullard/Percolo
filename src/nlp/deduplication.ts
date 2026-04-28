import { Similarity } from '../math/similarity';

export class Deduplicator {
  /**
   * Filters out duplicate documents based on dense vector similarity.
   * This uses a fast greedy approach.
   *
   * @param documents The original array of documents.
   * @param embeddings The embeddings matching the documents.
   * @param threshold The cosine similarity threshold (default: 0.95).
   * @returns An object containing the deduplicated documents, their embeddings, and mapping information.
   */
  static run(
    documents: string[],
    embeddings: number[][],
    threshold: number = 0.95
  ): {
      uniqueDocuments: string[],
      uniqueEmbeddings: number[][],
      // Maps original index to the unique index it was merged into
      indexMapping: number[]
  } {
    if (documents.length === 0 || embeddings.length === 0 || documents.length !== embeddings.length) {
       return { uniqueDocuments: documents, uniqueEmbeddings: embeddings, indexMapping: documents.map((_, i) => i) };
    }

    const uniqueDocuments: string[] = [];
    const uniqueEmbeddings: number[][] = [];
    const indexMapping: number[] = new Array(documents.length).fill(-1);

    for (let i = 0; i < documents.length; i++) {
        const currentEmb = embeddings[i];
        let isDuplicate = false;
        let mapTo = -1;

        // Compare against already accepted unique embeddings
        for (let j = 0; j < uniqueEmbeddings.length; j++) {
            const sim = Similarity.cosine(currentEmb, uniqueEmbeddings[j]);
            if (sim > threshold) {
                isDuplicate = true;
                mapTo = j;
                break;
            }
        }

        if (isDuplicate) {
            indexMapping[i] = mapTo;
        } else {
            uniqueDocuments.push(documents[i]);
            uniqueEmbeddings.push(currentEmb);
            indexMapping[i] = uniqueDocuments.length - 1;
        }
    }

    return { uniqueDocuments, uniqueEmbeddings, indexMapping };
  }
}
