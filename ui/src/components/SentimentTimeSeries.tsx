import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface SentimentTimeSeriesProps {
  documentSentiments: number[];
  binCount?: number;
  isDarkMode?: boolean;
}

export const SentimentTimeSeries: React.FC<SentimentTimeSeriesProps> = ({
  documentSentiments,
  binCount = 10,
  isDarkMode
}) => {
  if (!documentSentiments || documentSentiments.length === 0) {
    return <div className="p-4 text-center text-slate-500">No document sentiments available. Run analytics to view sentiment time-series.</div>;
  }

  const actualBinCount = Math.min(binCount, documentSentiments.length);
  const binSize = Math.ceil(documentSentiments.length / actualBinCount);

  // Average sentiment per bin
  const binnedSentiments: number[] = new Array(actualBinCount).fill(0);
  const binCounts: number[] = new Array(actualBinCount).fill(0);

  for (let i = 0; i < documentSentiments.length; i++) {
    const binIdx = Math.min(Math.floor(i / binSize), actualBinCount - 1);
    binnedSentiments[binIdx] += documentSentiments[i];
    binCounts[binIdx]++;
  }

  for (let i = 0; i < actualBinCount; i++) {
    if (binCounts[i] > 0) {
      binnedSentiments[i] /= binCounts[i];
    }
  }

  const xData = Array.from({length: actualBinCount}, (_, idx) => `Bin ${idx + 1}`);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Sentiment Time-Series</h3>
        <p className="text-sm text-slate-500">Average document sentiment over chronological bins</p>
      </div>
      <div className="flex-1 min-h-[300px] w-full p-2 relative">
        <Plot
          data={[
            {
              x: xData,
              y: binnedSentiments,
              type: 'scatter',
              mode: 'lines+markers',
              name: 'Sentiment',
              line: { shape: 'spline', color: 'rgba(234, 179, 8, 0.8)' }, // yellow-500
              fill: 'tozeroy',
              fillcolor: 'rgba(234, 179, 8, 0.2)'
            }
          ]}
          layout={{
            autosize: true,
            margin: { l: 50, r: 20, t: 20, b: 40 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: isDarkMode ? '#e2e8f0' : '#334155' },
            xaxis: {
              title: 'Time (Binned)',
              showgrid: true,
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            },
            yaxis: {
              title: 'Average Sentiment',
              showgrid: true,
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              range: [-1, 1],
              zeroline: true,
              zerolinecolor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
            }
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
          config={{ displayModeBar: false, responsive: true }}
        />
      </div>
    </div>
  );
};
