import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface SimilarityHeatmapProps {
  similarityMatrix: number[][];
  topicLabels: string[];
  isDarkMode?: boolean;
}

export const SimilarityHeatmap: React.FC<SimilarityHeatmapProps> = ({ similarityMatrix, topicLabels, isDarkMode }) => {
  if (!similarityMatrix || similarityMatrix.length === 0) {
    return <div className="p-4 text-center text-slate-500">No similarity data available</div>;
  }

  // Optional: For very large topic counts, we might want to truncate or aggregate,
  // but a scrollable/zoomable heatmap handles it reasonably well up to ~50-100 topics.

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Topic Similarity Heatmap</h3>
        <p className="text-sm text-slate-500">Cosine correlation between c-TF-IDF topic representations</p>
      </div>
      <div className="flex-1 min-h-[400px] w-full p-2 relative">
        <Plot
          data={[
            {
              z: similarityMatrix,
              x: topicLabels.map((_, i) => `T${i}`), // Short labels for X axis to prevent squishing
              y: topicLabels, // Full labels for Y axis
              type: 'heatmap',
              colorscale: 'Blues',
              showscale: true,
              hoverongaps: false,
              zmin: 0,
              zmax: 1
            }
          ]}
          layout={{
            autosize: true,
            margin: { l: 150, r: 20, t: 20, b: 50 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: isDarkMode ? '#e2e8f0' : '#334155' },
            xaxis: {
              tickangle: -45,
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            },
            yaxis: {
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
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
