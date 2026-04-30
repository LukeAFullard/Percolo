import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

export interface EntityNetworkData {
  nodes: Array<{ id: string; group: string; value: number }>;
  links: Array<{ source: string; target: string; value: number }>;
}

interface EntityNetworkProps {
  data: EntityNetworkData;
  isDarkMode?: boolean;
}

export const EntityNetwork: React.FC<EntityNetworkProps> = ({ data, isDarkMode }) => {
  if (!data || !data.nodes || data.nodes.length === 0) {
    return <div className="p-4 text-center text-slate-500">No entity network data available. Run deep NER in settings.</div>;
  }

  // To build a network graph in Plotly, we need to calculate positions for nodes.
  // A simple circular layout for demonstration.
  const nodes = data.nodes;
  const links = data.links;

  const numNodes = nodes.length;
  const radius = 10;

  const nodeX = nodes.map((_, i) => radius * Math.cos((2 * Math.PI * i) / numNodes));
  const nodeY = nodes.map((_, i) => radius * Math.sin((2 * Math.PI * i) / numNodes));

  const nodeMap = new Map(nodes.map((n, i) => [n.id, i]));

  const edgeX: number[] = [];
  const edgeY: number[] = [];
  const edgeWidths: number[] = [];

  links.forEach(link => {
    const sourceIdx = nodeMap.get(link.source);
    const targetIdx = nodeMap.get(link.target);
    if (sourceIdx !== undefined && targetIdx !== undefined) {
      edgeX.push(nodeX[sourceIdx], nodeX[targetIdx], NaN);
      edgeY.push(nodeY[sourceIdx], nodeY[targetIdx], NaN);
      edgeWidths.push(link.value);
    }
  });

  const nodeHover = nodes.map(n => `Entity: ${n.id}<br>Group: ${n.group}<br>Freq: ${n.value}`);
  const nodeColors = nodes.map(n => {
    switch (n.group) {
      case 'PER':
      case 'DATE': return '#f43f5e'; // rose-500
      case 'ORG':
      case 'EMAIL': return '#3b82f6'; // blue-500
      case 'LOC':
      case 'MONEY': return '#10b981'; // emerald-500
      case 'MISC': return '#8b5cf6'; // violet-500
      default: return '#64748b'; // slate-500
    }
  });

  const maxVal = Math.max(...nodes.map(n => n.value));
  const nodeSizes = nodes.map(n => Math.max(10, (n.value / maxVal) * 30));

  const fontColor = isDarkMode ? '#e2e8f0' : '#334155';

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Entity Co-occurrence Network</h3>
        <p className="text-sm text-slate-500">Entities co-occurring in the same documents</p>
      </div>
      <div className="flex-1 min-h-[400px] w-full p-2 relative">
        <Plot
          data={[
            {
              type: 'scatter',
              x: edgeX,
              y: edgeY,
              mode: 'lines',
              line: {
                width: 1, // Edge thickness can be adjusted based on co-occurrence value if needed
                color: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
              },
              hoverinfo: 'none'
            },
            {
              type: 'scatter',
              x: nodeX,
              y: nodeY,
              mode: 'markers+text',
              text: nodes.map(n => n.id),
              textposition: 'top center',
              hovertext: nodeHover,
              hoverinfo: 'text',
              marker: {
                size: nodeSizes,
                color: nodeColors,
                line: {
                  width: 1,
                  color: isDarkMode ? '#1e293b' : '#fff'
                }
              }
            }
          ]}
          layout={{
            autosize: true,
            margin: { l: 20, r: 20, t: 20, b: 20 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            showlegend: false,
            font: { color: fontColor },
            xaxis: { showgrid: false, zeroline: false, showticklabels: false },
            yaxis: { showgrid: false, zeroline: false, showticklabels: false },
            hovermode: 'closest'
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
          config={{ displayModeBar: false, responsive: true }}
        />
      </div>
    </div>
  );
};
