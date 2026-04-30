import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

export interface CorpusAnalyticsData {
  tokenFrequencies: Array<{ word: string; frequency: number }>;
  documentLengths: number[];
}

interface CorpusAnalyticsProps {
  data: CorpusAnalyticsData | undefined;
  isDarkMode?: boolean;
}

export const CorpusAnalytics: React.FC<CorpusAnalyticsProps> = ({ data, isDarkMode }) => {
  if (!data || !data.tokenFrequencies || !data.documentLengths || data.documentLengths.length === 0) {
    return <div className="p-4 text-center text-slate-500">No corpus analytics data available.</div>;
  }

  // 1. Zipf's Law Data (Rank vs Frequency)
  const zipfWords = data.tokenFrequencies.slice(0, 1000); // Top 1000 words
  const zipfRanks = zipfWords.map((_, i) => i + 1);
  const zipfFreqs = zipfWords.map(w => w.frequency);
  const zipfHover = zipfWords.map((w, i) => `Rank: ${i+1}<br>Word: ${w.word}<br>Freq: ${w.frequency}`);

  // 2. Corpus-Level Frequency Data (Top 30 unigrams)
  const topWords = zipfWords.slice(0, 30).reverse();
  const topWordLabels = topWords.map(w => w.word);
  const topWordFreqs = topWords.map(w => w.frequency);

  // Layout common options
  const fontColor = isDarkMode ? '#e2e8f0' : '#334155';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const paperBg = 'transparent';
  const plotBg = 'transparent';

  return (
    <div className="w-full flex flex-col gap-6">
        <div className="w-full h-[400px] flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Zipf's Law Distribution</h3>
                <p className="text-sm text-slate-500">Rank vs. Frequency of tokens (log-log scale)</p>
            </div>
            <div className="flex-1 w-full p-2 relative">
                <Plot
                  data={[
                    {
                      x: zipfRanks,
                      y: zipfFreqs,
                      text: zipfHover,
                      hoverinfo: 'text',
                      type: 'scatter',
                      mode: 'lines+markers',
                      marker: { color: 'rgba(139, 92, 246, 0.7)', size: 6 } // violet-500
                    }
                  ]}
                  layout={{
                    autosize: true,
                    margin: { l: 60, r: 20, t: 20, b: 50 },
                    paper_bgcolor: paperBg,
                    plot_bgcolor: plotBg,
                    font: { color: fontColor },
                    xaxis: { type: 'log', title: 'Rank (log)', gridcolor: gridColor },
                    yaxis: { type: 'log', title: 'Frequency (log)', gridcolor: gridColor }
                  }}
                  useResizeHandler={true}
                  style={{ width: '100%', height: '100%' }}
                  config={{ displayModeBar: false, responsive: true }}
                />
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="w-full h-[400px] flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Document Lengths</h3>
                    <p className="text-sm text-slate-500">Distribution of token counts per document</p>
                </div>
                <div className="flex-1 w-full p-2 relative">
                    <Plot
                      data={[
                        {
                          x: data.documentLengths,
                          type: 'histogram',
                          marker: { color: 'rgba(56, 189, 248, 0.7)' }, // sky-400
                          opacity: 0.75
                        }
                      ]}
                      layout={{
                        autosize: true,
                        margin: { l: 50, r: 20, t: 20, b: 50 },
                        paper_bgcolor: paperBg,
                        plot_bgcolor: plotBg,
                        font: { color: fontColor },
                        xaxis: { title: 'Token Count', gridcolor: gridColor },
                        yaxis: { title: 'Frequency', gridcolor: gridColor },
                        bargap: 0.1
                      }}
                      useResizeHandler={true}
                      style={{ width: '100%', height: '100%' }}
                      config={{ displayModeBar: false, responsive: true }}
                    />
                </div>
            </div>

            <div className="w-full h-[400px] flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Corpus-Level Frequencies</h3>
                    <p className="text-sm text-slate-500">Top 30 most frequent terms across all documents</p>
                </div>
                <div className="flex-1 w-full p-2 relative">
                    <Plot
                      data={[
                        {
                          y: topWordLabels,
                          x: topWordFreqs,
                          type: 'bar',
                          orientation: 'h',
                          marker: { color: 'rgba(244, 63, 94, 0.7)' } // rose-500
                        }
                      ]}
                      layout={{
                        autosize: true,
                        margin: { l: 100, r: 20, t: 20, b: 40 },
                        paper_bgcolor: paperBg,
                        plot_bgcolor: plotBg,
                        font: { color: fontColor },
                        xaxis: { gridcolor: gridColor, title: 'Frequency' },
                        yaxis: { gridcolor: gridColor }
                      }}
                      useResizeHandler={true}
                      style={{ width: '100%', height: '100%' }}
                      config={{ displayModeBar: false, responsive: true }}
                    />
                </div>
            </div>
        </div>
    </div>
  );
};
