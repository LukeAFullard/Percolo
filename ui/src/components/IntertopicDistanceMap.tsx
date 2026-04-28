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
  umapCentroids?: { [key: number]: [number, number] }; // Pre-calculated centroids from pipeline
  documentLabels: number[];
  uniqueClasses: number[];
  topicLabels: string[];
  topicSizes: number[];
  hoverSummaries?: string[];
  isDarkMode?: boolean;
}

export const IntertopicDistanceMap: React.FC<IntertopicDistanceMapProps> = ({
  umapCoordinates,
  umapCentroids,
  documentLabels,
  uniqueClasses,
  topicLabels,
  topicSizes,
  hoverSummaries,
  isDarkMode
}) => {
  if (!umapCoordinates || umapCoordinates.length === 0) {
    return <div className="p-4 text-center text-slate-500 flex flex-col items-center justify-center h-full"><p>No projection data available.</p><p className="text-sm">Run a pipeline to generate visualization.</p></div>;
  }

  // Use pre-calculated centroids if available, otherwise compute them
  const centroidsMap = new Map<number, [number, number]>();

  if (umapCentroids && Object.keys(umapCentroids).length > 0) {
      Object.entries(umapCentroids).forEach(([key, val]) => {
          centroidsMap.set(Number(key), val);
      });
  } else {
      // Fallback: We need to compute 2D centroids for each topic based on document UMAP coordinates.
      const clusterCounts = new Map<number, number>();

      for (let i = 0; i < umapCoordinates.length; i++) {
         const label = documentLabels[i];
         // Exclude noise
         if (label === -1) continue;

         const coords = umapCoordinates[i];
         const current = centroidsMap.get(label) || [0, 0];
         const count = clusterCounts.get(label) || 0;

         centroidsMap.set(label, [current[0] + coords[0], current[1] + coords[1]]);
         clusterCounts.set(label, count + 1);
      }

      for (const [label, sumCoords] of centroidsMap.entries()) {
          const count = clusterCounts.get(label)!;
          centroidsMap.set(label, [sumCoords[0] / count, sumCoords[1] / count]);
      }
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
     const centroid = centroidsMap.get(label);
     if (centroid) {
         x.push(centroid[0]);
         y.push(centroid[1]);

         const size = topicSizes[i] ? Math.max(10, (topicSizes[i] / maxTopicSize) * 50) : 15;
         sizes.push(size);

         // Extract topic ID correctly to fix invalid hsl issues (in case string labels are mistakenly passed)
         // Assuming topic ID maps to actual ID integers in normal operation, but fallback to index for string labels
         const id = typeof label === 'number' ? label : i;

         // Use the same color logic as HTML report
         colors.push(`hsl(${(id * 137.508) % 360}, 70%, 50%)`);

         validTopicLabels.push(topicLabels[i]);

         let text = `<b>${topicLabels[i]}</b><br>Size: ${topicSizes[i] || 0}`;
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
      <div className="flex-1 min-h-[400px] w-full p-2 relative" aria-label="Intertopic distance map showing 2D projection of topic centroids via UMAP">
        <table className="sr-only">
          <caption>Intertopic Distance Map Centroids</caption>
          <thead>
            <tr>
              <th scope="col">Topic Label</th>
              <th scope="col">UMAP X Coordinate</th>
              <th scope="col">UMAP Y Coordinate</th>
              <th scope="col">Size</th>
            </tr>
          </thead>
          <tbody>
            {validTopicLabels.map((label, idx) => (
              <tr key={idx}>
                <td>{label}</td>
                <td>{x[idx]}</td>
                <td>{y[idx]}</td>
                <td>{sizes[idx]}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            font: { color: isDarkMode ? '#e2e8f0' : '#334155' },
            xaxis: {
              showgrid: true,
              zeroline: false,
              showticklabels: false,
              gridcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            },
            yaxis: {
              showgrid: true,
              zeroline: false,
              showticklabels: false,
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
