export interface DocumentResult {
  text: string;
  topicLabel: number;
  probability: number;
  embedding?: number[];
  sentiment?: number;
}

export interface TopicInfo {
  label: number;
  name: string; // The c-TF-IDF derived name
  size: number;
  words: string[]; // Top K words
  centroid?: number[];
}

export interface PipelineResult {
  documents: DocumentResult[];
  topics: TopicInfo[];
}

export class Exporter {
  /**
   * Exports the entire pipeline result to a standard BERTopic JSON representation.
   */
  static toJSON(result: PipelineResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Exports the document-topic matrix to CSV format.
   * Format: Document,Topic,Probability,Sentiment (optional)
   */
  static toCSV(result: PipelineResult): string {
    const hasSentiment = result.documents.some(d => d.sentiment !== undefined);
    const headers = ['Document', 'Topic', 'Probability'];
    if (hasSentiment) headers.push('Sentiment');

    const escapeCSV = (str: string) => {
      // Escape quotes and wrap in quotes if there are commas or newlines
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = result.documents.map(doc => {
      const row = [
        escapeCSV(doc.text),
        doc.topicLabel.toString(),
        doc.probability.toString(),
      ];
      if (hasSentiment) {
        row.push(doc.sentiment?.toString() || '');
      }
      return row.join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Exports the result as a RAG-ready structure.
   * This structure is ideal for importing into LangChain/LlamaIndex or vector DBs.
   * Returns a JSON string representing an array of objects.
   */
  static toRAGReady(result: PipelineResult): string {
    const ragData = result.documents.map(doc => {
      const topic = result.topics.find(t => t.label === doc.topicLabel);

      return {
        pageContent: doc.text,
        metadata: {
          topic_label: doc.topicLabel,
          topic_name: topic ? topic.name : 'Unknown Topic',
          topic_words: topic ? topic.words : [],
          probability: doc.probability,
          sentiment: doc.sentiment,
        },
        embedding: doc.embedding
      };
    });

    return JSON.stringify(ragData, null, 2);
  }
}
