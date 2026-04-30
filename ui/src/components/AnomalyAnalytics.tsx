import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// Note: Plotly is loaded via CDN in index.html to bypass strict bundling constraints
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center text-slate-500">Loading visualizations...</div>;

interface AnomalyData {
  documentIndex: number;
  text: string;
  score: number;
  coords: [number, number];
}

interface AnomalyAnalyticsProps {
  data: AnomalyData[];
  umapData: [number, number][]; // Full UMAP data to plot the background
  parentLabels: number[]; // To distinguish clusters from outliers
  isDarkMode: boolean;
}

export const AnomalyAnalytics: React.FC<AnomalyAnalyticsProps> = ({ data, umapData, parentLabels, isDarkMode }) => {
  const fontColor = isDarkMode ? '#e2e8f0' : '#334155';
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0';

  // Separate UMAP points into clustered and anomalous
  const clusteredCoords: { x: number[], y: number[], text: string[] } = { x: [], y: [], text: [] };

  if (umapData && umapData.length > 0 && parentLabels && parentLabels.length === umapData.length) {
    for (let i = 0; i < umapData.length; i++) {
        if (parentLabels[i] !== -1) {
            clusteredCoords.x.push(umapData[i][0]);
            clusteredCoords.y.push(umapData[i][1]);
            clusteredCoords.text.push(`Doc ${i} (Topic ${parentLabels[i]})`);
        }
    }
  }

  // Anomalous points
  const anomalousCoords: { x: number[], y: number[], text: string[], scores: number[] } = { x: [], y: [], text: [], scores: [] };
  data.forEach(d => {
      anomalousCoords.x.push(d.coords[0]);
      anomalousCoords.y.push(d.coords[1]);
      anomalousCoords.text.push(`Doc ${d.documentIndex}<br>Anomaly Score: ${d.score.toFixed(3)}`);
      anomalousCoords.scores.push(d.score);
  });

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Semantic Anomaly Topography</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Visualizing outliers (red) that drift significantly from the corpus global centroid. Grey points represent clustered documents.
        </p>
        <div className="w-full h-[400px]">
          <Plot
            data={[
              {
                x: clusteredCoords.x,
                y: clusteredCoords.y,
                mode: 'markers',
                type: 'scatter',
                name: 'Clustered',
                text: clusteredCoords.text,
                hoverinfo: 'text',
                marker: {
                  color: isDarkMode ? '#475569' : '#cbd5e1', // slate-600 or slate-300
                  size: 6,
                  opacity: 0.5
                }
              },
              {
                x: anomalousCoords.x,
                y: anomalousCoords.y,
                mode: 'markers',
                type: 'scatter',
                name: 'Anomalies',
                text: anomalousCoords.text,
                hoverinfo: 'text',
                marker: {
                  color: anomalousCoords.scores,
                  colorscale: 'YlOrRd', // Yellow to Red heatmap based on anomaly score
                  size: 8,
                  opacity: 0.8,
                  line: {
                    color: isDarkMode ? '#1e293b' : '#fff',
                    width: 1
                  },
                  showscale: true,
                  colorbar: {
                    title: 'Anomaly Score',
                    thickness: 15,
                    tickfont: { color: fontColor },
                    titlefont: { color: fontColor }
                  }
                }
              }
            ]}
            layout={{
              autosize: true,
              margin: { l: 20, r: 20, t: 20, b: 20 },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { color: fontColor },
              xaxis: { showgrid: true, gridcolor: gridColor, zeroline: false, showticklabels: false },
              yaxis: { showgrid: true, gridcolor: gridColor, zeroline: false, showticklabels: false },
              hovermode: 'closest',
              showlegend: true,
              legend: { x: 0, y: 1 }
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
            config={{ displayModeBar: false, responsive: true }}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Top Anomalous Documents</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="p-3 font-semibold rounded-tl-lg">Rank</th>
                <th className="p-3 font-semibold">Doc Index</th>
                <th className="p-3 font-semibold">Anomaly Score</th>
                <th className="p-3 font-semibold rounded-tr-lg">Text Snippet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.slice(0, 10).map((item, idx) => (
                <tr key={item.documentIndex} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="p-3 font-medium text-slate-900 dark:text-white">#{idx + 1}</td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">[{item.documentIndex}]</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs font-semibold">
                      {item.score.toFixed(4)}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-300 truncate max-w-md" title={item.text}>
                    {item.text}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500">
                    No anomalies detected. All documents belong to dense clusters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
