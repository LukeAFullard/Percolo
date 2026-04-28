import React from 'react';
// Note: Due to Vite bundling and COEP/COOP constraints, plotly.js is dynamically injected via CDN.
// We use the any type for Plot to avoid react-plotly.js missing types in strict mode since we bypass standard bundling.
// In Vite/ES modules, default exports sometimes need .default
import createPlotlyComponentPkg from 'react-plotly.js/factory';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// Try to use the globally loaded Plotly if available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface IntertopicDistanceMapProps {
  umapCoordinates: number[][];
  documentLabels: number[];
  uniqueClasses: number[];
  topicLabels: string[];
  topicSizes: number[];
  hoverSummaries?: string[];
}

export const IntertopicDistanceMap: React.FC<IntertopicDistanceMapProps> = ({
  umapCoordinates,
  documentLabels,
  uniqueClasses,
  topicLabels,
  topicSizes,
  hoverSummaries
}) => {
  if (!umapCoordinates || umapCoordinates.length === 0) {
    return <div className="p-4 text-center text-slate-500">No projection data available</div>;
  }

  // We need to compute 2D centroids for each topic based on document UMAP coordinates.
  const umapCentroids = new Map<number, [number, number]>();
  const clusterCounts = new Map<number, number>();

  for (let i = 0; i < umapCoordinates.length; i++) {
     const label = documentLabels[i];
     // Exclude noise
     if (label === -1) continue;

     const coords = umapCoordinates[i];
     const current = umapCentroids.get(label) || [0, 0];
     const count = clusterCounts.get(label) || 0;

     umapCentroids.set(label, [current[0] + coords[0], current[1] + coords[1]]);
     clusterCounts.set(label, count + 1);
  }

  for (const [label, sumCoords] of umapCentroids.entries()) {
      const count = clusterCounts.get(label)!;
      umapCentroids.set(label, [sumCoords[0] / count, sumCoords[1] / count]);
  }

  // Build the traces array for Plotly (one trace per valid topic)
  const x: number[] = [];
  const y: number[] = [];
  const sizes: number[] = [];
  const colors: string[] = [];
  const validTopicLabels: string[] = [];
  const hoverTexts: string[] = [];

  const maxTopicSize = Math.max(...(topicSizes.length ? topicSizes : [1]));

  uniqueClasses.forEach((label, i) => {
     if (label === -1) return;
     const centroid = umapCentroids.get(label);
     if (centroid) {
         x.push(centroid[0]);
         y.push(centroid[1]);

         const size = topicSizes[i] ? Math.max(10, (topicSizes[i] / maxTopicSize) * 50) : 15;
         sizes.push(size);

         // Use the same color logic as HTML report
         colors.push(`hsl(${(i * 137.508) % 360}, 70%, 50%)`);

         validTopicLabels.push(topicLabels[i]);

         let text = `<b>${topicLabels[i]}</b><br>Size: ${topicSizes[i] || clusterCounts.get(label) || 0}`;
         if (hoverSummaries && hoverSummaries[i]) {
            text += `<br><br><i>${hoverSummaries[i]}</i>`;
         }
         hoverTexts.push(text);
     }
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
              text: hoverTexts,
              hoverinfo: 'text',
              mode: 'text+markers',
              textposition: 'top center',
              type: 'scatter',
              marker: {
                size: sizes,
                color: colors,
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
