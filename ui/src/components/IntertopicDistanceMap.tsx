import React from 'react';
// Note: Due to Vite bundling and COEP/COOP constraints, plotly.js is dynamically injected via CDN.
// We use the any type for Plot to avoid react-plotly.js missing types in strict mode since we bypass standard bundling.
// In Vite/ES modules, default exports sometimes need .default
import createPlotlyComponentPkg from 'react-plotly.js/factory';
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// Try to use the globally loaded Plotly if available
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface IntertopicDistanceMapProps {
  umapCoordinates: number[][];
  topicLabels: string[];
  topicSizes: number[];
  hoverSummaries?: string[];
}

export const IntertopicDistanceMap: React.FC<IntertopicDistanceMapProps> = ({
  umapCoordinates,
  topicLabels,
  topicSizes,
  hoverSummaries
}) => {
  if (!umapCoordinates || umapCoordinates.length === 0) {
    return <div className="p-4 text-center text-slate-500">No projection data available</div>;
  }

  const x = umapCoordinates.map(coord => coord[0]);
  const y = umapCoordinates.map(coord => coord[1]);

  // Use topic sizes for marker sizes if available, else default size
  const maxTopicSize = Math.max(...(topicSizes.length ? topicSizes : [1]));
  const markerSizes = topicSizes.length > 0
    ? topicSizes.map(size => Math.max(10, (size / maxTopicSize) * 50))
    : Array(umapCoordinates.length).fill(15);

  const hoverText = topicLabels.map((label, i) => {
    let text = `<b>${label}</b>`;
    if (topicSizes[i]) text += `<br>Size: ${topicSizes[i]}`;
    if (hoverSummaries && hoverSummaries[i]) {
      text += `<br><br><i>${hoverSummaries[i]}</i>`;
    }
    return text;
  });

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Intertopic Distance Map</h3>
        <p className="text-sm text-slate-500">2D projection of topic centroids via UMAP</p>
      </div>
      <div className="flex-1 min-h-[400px] w-full p-2 relative">
        <Plot
          data={[
            {
              x: x,
              y: y,
              text: hoverText,
              hoverinfo: 'text',
              mode: 'text+markers',
              textposition: 'top center',
              type: 'scatter',
              marker: {
                size: markerSizes,
                color: x, // Use x coordinate for a gradient color map
                colorscale: 'Viridis',
                line: {
                  color: 'rgba(255, 255, 255, 0.5)',
                  width: 1
                },
                opacity: 0.8
              }
            }
          ]}
          layout={{
            autosize: true,
            margin: { l: 20, r: 20, t: 20, b: 20 },
            hovermode: 'closest',
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            xaxis: {
              showgrid: true,
              zeroline: false,
              showticklabels: false,
              gridcolor: 'rgba(128, 128, 128, 0.2)'
            },
            yaxis: {
              showgrid: true,
              zeroline: false,
              showticklabels: false,
              gridcolor: 'rgba(128, 128, 128, 0.2)'
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
