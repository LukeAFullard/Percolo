import { LexicalExtractor } from './src/nlp/lexical.js';
import { CTFIDF } from './src/math/ctfidf.js';
import { SummarizationEngine } from './src/nlp/summarization.js';

const docs = ["Doc 1 text", "Doc 2 text", "Doc 3 text"];
const labels = [0, 0, 1];

const lex = LexicalExtractor.extract(docs, labels);
const ctfidf = CTFIDF.calculate(lex.matrix.toDense(), lex.globalTermFrequencies, lex.averageClassSize);
const topWords = CTFIDF.extractTopWordsPerClass(ctfidf, lex.vocabulary, 3);
console.log(topWords);
