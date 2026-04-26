import React from 'react';
import createPlotlyComponentPkg from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPlotlyComponent = (createPlotlyComponentPkg as any).default || createPlotlyComponentPkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = typeof window !== 'undefined' ? (window as any).Plotly : null;
const Plot = Plotly ? (createPlotlyComponent as (...args: unknown[]) => React.ElementType)(Plotly) : () => <div className="p-4 text-center">Loading Plotly...</div>;

interface TopicBarchartProps {
  topicWords: Array<{ word: string; score: number }>;
  topicId: number;
}

export const TopicBarchart: React.FC<TopicBarchartProps> = ({ topicWords, topicId }) => {
  if (!topicWords || topicWords.length === 0) {
    return <div className="p-4 text-center text-slate-500">No words available for this topic</div>;
  }

  // Plotly requires arrays for x and y
  // Reverse the arrays so the highest score is at the top of the horizontal bar chart
  const words = [...topicWords].map(w => w.word).reverse();
  const scores = [...topicWords].map(w => w.score).reverse();

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Topic {topicId} Word Scores</h3>
        <p className="text-sm text-slate-500">c-TF-IDF term weighting</p>
      </div>
      <div className="flex-1 min-h-[300px] w-full p-2 relative">
        <Plot
          data={[
            {
              type: 'bar',
              x: scores,
              y: words,
              orientation: 'h',
              marker: {
                color: 'rgba(59, 130, 246, 0.7)', // Tailwind blue-500 equivalent
                line: {
                  color: 'rgba(37, 99, 235, 1)', // Tailwind blue-600 equivalent
                  width: 1
                }
              }
            }
          ]}
          layout={{
            autosize: true,
            margin: { l: 100, r: 20, t: 20, b: 40 }, // Left margin for longer words
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            xaxis: {
              showgrid: true,
              zeroline: true,
              gridcolor: 'rgba(128, 128, 128, 0.1)',
              zerolinecolor: 'rgba(128, 128, 128, 0.2)',
            },
            yaxis: {
              showgrid: false,
              zeroline: false,
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
