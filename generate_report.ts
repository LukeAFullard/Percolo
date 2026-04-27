import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmbeddingPipeline } from './src/nlp/embeddings.js';
import { UMAPReducer } from './src/math/umap.js';
import { ClusteringEngine } from './src/math/clustering.js';
import { LexicalExtractor } from './src/nlp/lexical.js';
import { CTFIDF } from './src/math/ctfidf.js';
import { NLPAnalytics, NLPAnalyticsResult } from './src/nlp/analytics.js';
import { ReportGenerator, ReportData } from './src/io/report.js';

const NEWSGROUPS_SUBSET = [
  // Space
  "The Mars Rover successfully landed on the red planet today, sending back high-resolution images.",
  "NASA announced a new mission to explore the icy moons of Jupiter for signs of extraterrestrial life.",
  "SpaceX successfully launched and landed another Falcon 9 booster at Cape Canaveral.",
  "The James Webb Space Telescope captured a stunning view of a distant galaxy cluster.",
  "Astronomers have discovered a new exoplanet in the habitable zone of a nearby star.",
  // Autos
  "The new electric vehicle features a range of over 400 miles on a single charge.",
  "Toyota recalled several models due to a manufacturing defect in the braking system.",
  "Formula 1 introduced new aerodynamic regulations for the upcoming racing season.",
  "I need advice on changing the oil and replacing the spark plugs on my Honda Civic.",
  "The automatic transmission in my truck is slipping between 2nd and 3rd gear.",
  // Medicine
  "Researchers published a groundbreaking study on the efficacy of a new mRNA vaccine.",
  "The patient presented with acute abdominal pain and elevated white blood cell counts.",
  "A new clinical trial for an Alzheimer's drug shows promising results in early stages.",
  "The hospital implemented new sanitation protocols to reduce the spread of infections.",
  "She was prescribed antibiotics to treat a severe bacterial pneumonia infection."
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const documents = NEWSGROUPS_SUBSET;
  console.log(`Processing ${documents.length} documents...`);

  // 1. Embeddings
  console.log("Generating embeddings...");
  const embeddings = await EmbeddingPipeline.embedTexts(documents, { modelName: 'Xenova/all-MiniLM-L6-v2' });

  // 2. UMAP
  console.log("Reducing dimensions...");
  const umapCoords = await UMAPReducer.reduceAsync(embeddings, { nNeighbors: 2, minDist: 0.1, nComponents: 2, randomState: 42 });

  // 3. HDBSCAN
  console.log("Clustering...");
  const clustering = await ClusteringEngine.clusterAsync(umapCoords, { minClusterSize: 3 });

  // 4. Lexical Extraction
  console.log("Extracting Lexical CSR...");
  const csrData = LexicalExtractor.extract(documents, clustering.labels, { minDf: 1 });

  // 5. c-TF-IDF
  console.log("Calculating c-TF-IDF...");
  const denseMatrix = csrData.matrix.toDense();
  const ctfidfScores = CTFIDF.calculate(denseMatrix, csrData.globalTermFrequencies, csrData.averageClassSize, { vocabulary: csrData.vocabulary });
  const topicWords = CTFIDF.extractTopWordsPerClass(ctfidfScores, csrData.vocabulary, 5);

  // 6. Analytics
  console.log("Running analytics...");
  const analyticsResult: Record<number, NLPAnalyticsResult> = {};

  csrData.uniqueClasses.forEach(clusterId => {
      if (clusterId === -1) return; // Skip noise

      // Gather documents for this cluster
      const clusterDocs: string[] = [];
      for (let i = 0; i < clustering.labels.length; i++) {
        if (clustering.labels[i] === clusterId) {
          clusterDocs.push(documents[i]);
        }
      }

      const clusterSentiments: number[] = [];
      const combinedEntities: { dates: string[], emails: string[], money: string[] } = {
         dates: [], emails: [], money: []
      };

      clusterDocs.forEach(doc => {
          const docAnalytics = NLPAnalytics.processDocument(doc);
          clusterSentiments.push(docAnalytics.sentiment);
          combinedEntities.dates.push(...docAnalytics.entities.dates);
          combinedEntities.emails.push(...docAnalytics.entities.emails);
          combinedEntities.money.push(...docAnalytics.entities.money);
      });

      // Deduplicate entities for the cluster summary
      analyticsResult[clusterId] = {
         sentiment: NLPAnalytics.aggregateClusterSentiment(clusterSentiments),
         entities: {
             dates: Array.from(new Set(combinedEntities.dates)),
             emails: Array.from(new Set(combinedEntities.emails)),
             money: Array.from(new Set(combinedEntities.money))
         }
      };
  });

  const topics: ReportData['topics'] = csrData.uniqueClasses.map((id, index) => {
    const size = clustering.labels.filter(l => l === id).length;
    const words = topicWords[index] || [];
    return {
      id,
      name: words.slice(0, 3).map(w => w.word).join(', '),
      size,
      words,
      analytics: analyticsResult[id]
    }
  });

  // Assemble Report Payload
  const results: ReportData = {
      projectName: "Example 20NG Subset",
      totalDocuments: documents.length,
      topics: topics,
      executionTimeMs: 1500
  };

  console.log("Generating report...");
  const reportHTML = ReportGenerator.generateHTML(results);

  fs.writeFileSync(path.join(__dirname, 'example_report.html'), reportHTML);
  console.log("Report saved to example_report.html");
}

main().catch(console.error);
