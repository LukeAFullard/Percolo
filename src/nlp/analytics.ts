// @ts-ignore
import winkNLP from 'wink-nlp';
// @ts-ignore
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);
const its = nlp.its;
const as = nlp.as;

export interface NLPAnalyticsResult {
  sentiment: number;
  entities: {
    dates: string[];
    emails: string[];
    money: string[];
  };
}

export class NLPAnalytics {
  static processDocument(text: string): NLPAnalyticsResult {
    const doc = nlp.readDoc(text);

    const sentiment = doc.out(its.sentiment);

    const entities = doc.entities();

    const dates = entities.filter((e: any) => e.out(its.detail).type === 'DATE').out();
    const emails = entities.filter((e: any) => e.out(its.detail).type === 'EMAIL').out();
    const money = entities.filter((e: any) => e.out(its.detail).type === 'MONEY').out();

    return {
      sentiment: Number(sentiment),
      entities: {
        dates: dates,
        emails: emails,
        money: money
      }
    };
  }

  static aggregateClusterSentiment(documentSentiments: number[]): number {
    if (documentSentiments.length === 0) return 0;
    const sum = documentSentiments.reduce((acc, val) => acc + val, 0);
    return sum / documentSentiments.length;
  }
}
