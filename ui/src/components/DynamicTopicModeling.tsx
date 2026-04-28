import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface DynamicTopicModelingProps {
  documentLabels: number[];
  uniqueClasses: number[];
  topicLabels: string[];
  binCount?: number;
  isDarkMode?: boolean;
}

export const DynamicTopicModeling: React.FC<DynamicTopicModelingProps> = ({
    documentLabels,
    uniqueClasses,
    topicLabels,
    binCount = 10,
    isDarkMode
}) => {
  if (!documentLabels || documentLabels.length === 0) {
    return <div className="p-4 text-center text-slate-500">No document data available.</div>;
  }

  // Divide documents into chronological bins (assuming original order represents time)
  const actualBinCount = Math.min(binCount, documentLabels.length);
  const binSize = Math.ceil(documentLabels.length / actualBinCount);

  // Calculate frequency of each topic per bin
  const topicFrequencies = uniqueClasses.map(() => new Array(actualBinCount).fill(0));

  for (let i = 0; i < documentLabels.length; i++) {
      const label = documentLabels[i];
      const clsIdx = uniqueClasses.indexOf(label);
      if (clsIdx !== -1) {
          const binIdx = Math.min(Math.floor(i / binSize), actualBinCount - 1);
          topicFrequencies[clsIdx][binIdx]++;
      }
  }

  // Create plotly traces for each topic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traces: any[] = uniqueClasses.map((_cls, i) => {
      // Don't plot outliers if they exist (-1 is usually first)
      if (uniqueClasses[i] === -1) return null;

      return {
          x: Array.from({length: actualBinCount}, (_, idx) => `Bin ${idx + 1}`),
          y: topicFrequencies[i],
          type: 'scatter',
          mode: 'lines+markers',
          name: topicLabels[i] || `Topic ${uniqueClasses[i]}`,
          line: { shape: 'spline' } // Smooth lines
      };
  }).filter(t => t !== null);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Dynamic Topic Modeling (Over Time)</h3>
        <p className="text-sm text-slate-500">Document topic frequency binned sequentially</p>
      </div>
      <div className="flex-1 min-h-[300px] w-full p-2 relative">
        <Plot
          data={traces}
          layout={{
            autosize: true,
            margin: { l: 40, r: 20, t: 20, b: 40 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: isDarkMode ? '#e2e8f0' : '#334155' },
            xaxis: {
              showgrid: false,
              zeroline: false,
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            },
            yaxis: {
              showgrid: true,
              zeroline: false,
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            },
            showlegend: true,
            legend: {
                orientation: 'h',
                y: -0.2
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
