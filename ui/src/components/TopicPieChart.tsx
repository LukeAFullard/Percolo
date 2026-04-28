import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface TopicPieChartProps {
  topicSizes: number[];
  topicLabels: string[];
  uniqueClasses: number[];
  isDarkMode?: boolean;
}

export const TopicPieChart: React.FC<TopicPieChartProps> = ({ topicSizes, topicLabels, uniqueClasses, isDarkMode }) => {
  if (!topicSizes || topicSizes.length === 0 || !uniqueClasses || uniqueClasses.length === 0) {
    return <div className="p-4 text-center text-slate-500 flex flex-col items-center justify-center h-full"><p>No topic size data available</p><p className="text-sm">Data might be missing or pipeline failed.</p></div>;
  }

  // Combine data to sort
  const combinedData = uniqueClasses.map((id, index) => ({
    id,
    size: topicSizes[index],
    label: topicLabels[index],
    originalIndex: index
  })).sort((a, b) => b.size - a.size); // Sort by size descending

  const values = combinedData.map(d => d.size);
  const labels = combinedData.map(d => d.id === -1 ? 'Noise (-1)' : d.label);
  const pieColors = combinedData.map(d => {
      if (d.id === -1) return '#cbd5e1'; // noise is gray
      return `hsl(${(d.id * 137.508) % 360}, 70%, 50%)`;
  });

  const fontColor = isDarkMode ? '#e2e8f0' : '#334155'; // Tailwind slate-200 or slate-700

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Topic Sizes</h3>
        <p className="text-sm text-slate-500">Distribution of documents across topics</p>
      </div>
      <div className="flex-1 min-h-[300px] w-full p-2 relative" aria-label="Pie chart showing the relative sizes of discovered topics">
        <table className="sr-only">
          <caption>Topic Distribution Sizes</caption>
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">Size</th>
            </tr>
          </thead>
          <tbody>
            {combinedData.map((data, idx) => (
              <tr key={idx}>
                <td>{data.id === -1 ? 'Noise (-1)' : data.label}</td>
                <td>{data.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Plot
          data={[
            {
              values: values,
              labels: labels,
              type: 'pie',
              marker: {
                colors: pieColors,
                line: {
                  color: isDarkMode ? '#1e293b' : '#ffffff', // Tailwind slate-800 or white
                  width: 1
                }
              },
              hoverinfo: 'label+percent+value',
              textinfo: 'percent',
            }
          ]}
          layout={{
            autosize: true,
            margin: { l: 20, r: 20, t: 20, b: 20 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: fontColor },
            showlegend: true,
            legend: {
              orientation: 'h',
              y: -0.1
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
