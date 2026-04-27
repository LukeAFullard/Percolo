import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface DocumentDistributionProps {
  probabilities: number[];
  topicLabels: string[];
}

export const DocumentDistribution: React.FC<DocumentDistributionProps> = ({ probabilities, topicLabels }) => {
  if (!probabilities || probabilities.length === 0) {
    return <div className="p-4 text-center text-slate-500">No distribution data available. Enable Fuzzy Clustering in settings.</div>;
  }

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Fuzzy Topic Distribution</h3>
        <p className="text-sm text-slate-500">Probability of the selected document belonging to each topic</p>
      </div>
      <div className="flex-1 min-h-[300px] w-full p-2 relative">
        <Plot
          data={[
            {
              type: 'bar',
              x: topicLabels.map((_, i) => `T${i}`), // Shorthand for x axis
              y: probabilities,
              marker: {
                color: 'rgba(16, 185, 129, 0.7)', // Tailwind emerald-500
                line: {
                  color: 'rgba(5, 150, 105, 1)', // Tailwind emerald-600
                  width: 1
                }
              }
            }
          ]}
          layout={{
            autosize: true,
            margin: { l: 40, r: 20, t: 20, b: 40 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            xaxis: {
              showgrid: false,
              zeroline: true,
            },
            yaxis: {
              showgrid: true,
              zeroline: true,
              gridcolor: 'rgba(128, 128, 128, 0.1)',
              range: [0, 1] // Probabilities are 0 to 1
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
