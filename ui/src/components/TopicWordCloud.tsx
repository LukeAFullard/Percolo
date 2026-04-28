import React from 'react';
import ReactWordcloud from 'react-wordcloud';

interface TopicWordCloudProps {
  topicWords: Array<{ word: string; score: number }>;
  topicId: number;
}

export const TopicWordCloud: React.FC<TopicWordCloudProps> = ({ topicWords, topicId }) => {
  if (!topicWords || topicWords.length === 0) {
    return <div className="p-4 text-center text-slate-500">No words available for this topic</div>;
  }

  // Format data for react-wordcloud
  const words = topicWords.map(w => ({
    text: w.word,
    value: w.score * 100 // Scale up for better size differentiation
  }));

  // Generate variations of the topic's HSL color for the word cloud
  const baseHue = (topicId * 137.508) % 360;
  const colors = [
    `hsl(${baseHue}, 70%, 50%)`,
    `hsl(${baseHue}, 60%, 40%)`,
    `hsl(${baseHue}, 80%, 60%)`,
    `hsl(${baseHue}, 50%, 30%)`,
    `hsl(${baseHue}, 90%, 70%)`
  ];

  const options = {
    colors: colors,
    enableTooltip: true,
    deterministic: true,
    fontFamily: 'Inter, sans-serif',
    fontSizes: [14, 60] as [number, number],
    fontStyle: 'normal',
    fontWeight: 'normal',
    padding: 1,
    rotations: 1, // Minimize rotation for readability
    rotationAngles: [0, 90] as [number, number],
    scale: 'sqrt' as const,
    spiral: 'archimedean' as const,
    transitionDuration: 1000,
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
        <div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Topic {topicId} Word Cloud</h3>
            <p className="text-sm text-slate-500">c-TF-IDF term weighting</p>
        </div>
      </div>
      <div className="flex-1 min-h-[300px] w-full p-2 relative flex items-center justify-center">
         <div style={{ height: '100%', width: '100%', minHeight: '300px' }}>
            <ReactWordcloud words={words} options={options} />
         </div>
      </div>
    </div>
  );
};
