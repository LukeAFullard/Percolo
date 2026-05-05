import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface TemporalTrendsProps {
  documentSentiments?: number[];
  documentToxicity?: number[];
  documentBias?: number[];
  binCount?: number;
  isDarkMode?: boolean;
}

export const TemporalTrends: React.FC<TemporalTrendsProps> = ({
  documentSentiments,
  documentToxicity,
  documentBias,
  binCount = 10,
  isDarkMode
}) => {
  const hasSentiment = documentSentiments && documentSentiments.length > 0;
  const hasToxicity = documentToxicity && documentToxicity.length > 0;
  const hasBias = documentBias && documentBias.length > 0;

  if (!hasSentiment && !hasToxicity && !hasBias) {
    return <div className="p-4 text-center text-slate-500">No temporal data available. Run analytics or toxicity/bias audits to view temporal trends.</div>;
  }

  // Calculate actual bin count based on the largest dataset available
  const dataLength = hasSentiment ? documentSentiments!.length : (hasToxicity ? documentToxicity!.length : (documentBias ? documentBias.length : 0));
  const actualBinCount = Math.min(binCount, dataLength);
  const binSize = Math.ceil(dataLength / actualBinCount);

  // Helper to compute mean and stdev for bins
  const processMetric = (data: number[]) => {
      const binnedMeans: number[] = new Array(actualBinCount).fill(0);
      const binnedStdev: number[] = new Array(actualBinCount).fill(0);
      const binValues: number[][] = Array.from({ length: actualBinCount }, () => []);

      for (let i = 0; i < data.length; i++) {
        const binIdx = Math.min(Math.floor(i / binSize), actualBinCount - 1);
        binValues[binIdx].push(data[i]);
      }

      for (let i = 0; i < actualBinCount; i++) {
        const vals = binValues[i];
        if (vals.length > 0) {
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            binnedMeans[i] = mean;

            // Calculate standard deviation (volatility)
            const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
            binnedStdev[i] = Math.sqrt(variance);
        }
      }

      return { means: binnedMeans, stdev: binnedStdev };
  };

  const xData = Array.from({length: actualBinCount}, (_, idx) => `Bin ${idx + 1}`);
  const traces: any[] = [];

  if (hasSentiment) {
      const { means, stdev } = processMetric(documentSentiments!);

      const upper = means.map((m, i) => m + stdev[i]);
      const lower = means.map((m, i) => m - stdev[i]);

      // Sentiment Trace
      traces.push({
          x: xData,
          y: means,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Sentiment (Mean)',
          line: { shape: 'spline', color: 'rgba(234, 179, 8, 1)' }, // yellow-500
          marker: { size: 6 }
      });

      // Volatility Band (Sentiment)
      traces.push({
          x: [...xData, ...[...xData].reverse()],
          y: [...upper, ...[...lower].reverse()],
          fill: 'toself',
          fillcolor: 'rgba(234, 179, 8, 0.2)',
          line: { color: 'transparent' },
          name: 'Sentiment Volatility (±1 SD)',
          showlegend: true,
          type: 'scatter'
      });
  }

  if (hasToxicity) {
      const { means, stdev } = processMetric(documentToxicity!);

      const upper = means.map((m, i) => m + stdev[i]);
      const lower = means.map((m, i) => Math.max(0, m - stdev[i])); // Toxicity >= 0

      // Toxicity Trace
      traces.push({
          x: xData,
          y: means,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Toxicity (Mean)',
          line: { shape: 'spline', color: 'rgba(239, 68, 68, 1)' }, // red-500
          marker: { size: 6 }
      });

      // Volatility Band (Toxicity)
      traces.push({
          x: [...xData, ...[...xData].reverse()],
          y: [...upper, ...[...lower].reverse()],
          fill: 'toself',
          fillcolor: 'rgba(239, 68, 68, 0.2)',
          line: { color: 'transparent' },
          name: 'Toxicity Volatility (±1 SD)',
          showlegend: true,
          type: 'scatter'
      });
  }

  if (hasBias) {
      const { means, stdev } = processMetric(documentBias!);

      const upper = means.map((m, i) => Math.min(1, m + stdev[i]));
      const lower = means.map((m, i) => Math.max(-1, m - stdev[i]));

      // Bias Trace
      traces.push({
          x: xData,
          y: means,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Political Bias (Mean)',
          line: { shape: 'spline', color: 'rgba(168, 85, 247, 1)' }, // purple-500
          marker: { size: 6 }
      });

      // Volatility Band (Bias)
      traces.push({
          x: [...xData, ...[...xData].reverse()],
          y: [...upper, ...[...lower].reverse()],
          fill: 'toself',
          fillcolor: 'rgba(168, 85, 247, 0.1)', // purple-500 light
          line: { color: 'transparent' },
          name: 'Bias Volatility (±1 SD)',
          showlegend: true,
          type: 'scatter'
      });
  }

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Temporal Trends & Volatility</h3>
        <p className="text-sm text-slate-500">Longitudinal analysis of document sentiment, toxicity, and political bias</p>
      </div>
      <div className="flex-1 min-h-[400px] w-full p-2 relative">
        <Plot
          data={traces}
          layout={{
            autosize: true,
            margin: { l: 50, r: 20, t: 20, b: 40 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: isDarkMode ? '#e2e8f0' : '#334155' },
            legend: { orientation: 'h', y: -0.2 },
            xaxis: {
              title: 'Time (Binned)',
              showgrid: true,
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            },
            yaxis: {
              title: 'Score',
              showgrid: true,
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              range: hasSentiment ? [-1, 1] : [0, 1],
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
