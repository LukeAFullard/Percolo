import React from 'react';
import { usePercolo } from './hooks/usePercolo';
import { Upload, Settings, BarChart2, Activity, Play, FileText } from 'lucide-react';
import { IntertopicDistanceMap } from './components/IntertopicDistanceMap';

function App() {
  const [activeTab, setActiveTab] = React.useState<'upload' | 'visualize'>('upload');
  const [docs, setDocs] = React.useState<string[]>([
    "This is a test document about artificial intelligence and machine learning models.",
    "Another text discussing the stock market, trading, and finance economics.",
    "The weather today is sunny with a chance of rain in the late afternoon.",
    "Deep learning neural networks require significant computational resources.",
    "Investment strategies often involve diversifying a portfolio across multiple assets."
  ]);
  const [inputText, setInputText] = React.useState(docs.join('\n\n'));

  const { runPipeline, isProcessing, progress, results, error } = usePercolo();

  const handleRun = () => {
    const documents = inputText.split('\n\n').filter(d => d.trim().length > 0);
    setDocs(documents);
    runPipeline(documents);
    setActiveTab('visualize');
  };

  // Mock data for initial render if no results yet
  const mockUmap = [[-1.5, 2.1], [3.2, -0.5], [0.8, -2.4]];
  const mockLabels = ["Topic 0: AI/ML", "Topic 1: Finance", "Topic 2: Weather"];
  const mockSizes = [50, 45, 15];

  // Transform array buffer labels into strings for plotting
  const processLabels = (labels: any) => {
      if (!labels) return null;
      if (ArrayBuffer.isView(labels) || Array.isArray(labels)) {
         return Array.from(labels as Iterable<any>).map(l => `Topic ${l}`);
      }
      return labels;
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Percolo
          </h1>
          <p className="text-xs text-slate-500 mt-1">Edge-Native BERTopic</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('upload')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              activeTab === 'upload'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
            }`}
          >
            <Upload className="w-5 h-5" />
            Data Source
          </button>
          <button
            onClick={() => setActiveTab('visualize')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              activeTab === 'visualize'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
            }`}
          >
            <BarChart2 className="w-5 h-5" />
            Visualization
          </button>

        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-sm text-slate-600 dark:text-slate-400">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {error && (
          <div className="absolute top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 shadow-md">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Data Source</h2>
                <p className="text-slate-500">Provide documents to analyze. Separate documents with double newlines.</p>
              </div>

              <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer bg-white dark:bg-slate-800">
                <FileText className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">Drag and drop files here</h3>
                <p className="text-sm text-slate-500 mb-4">Or paste your text below</p>
                <button className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-md transition-colors text-sm font-medium">
                  Browse Files
                </button>
              </div>

              <div>
                <textarea
                  className="w-full h-64 p-4 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow resize-y"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste your documents here..."
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleRun}
                  disabled={isProcessing || inputText.trim().length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium shadow-sm"
                >
                  {isProcessing ? (
                    <Activity className="w-5 h-5 animate-pulse" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                  {isProcessing ? 'Processing...' : 'Run Pipeline'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'visualize' && (
          <div className="flex-1 flex flex-col p-6 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
            {isProcessing && progress ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <Activity className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
                <h3 className="text-xl font-medium mb-2">Processing Pipeline</h3>
                <p className="text-slate-500 mb-6">Phase: {progress.phase}</p>

                <div className="w-64 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress.progress || 0}%` }}
                  />
                </div>
                <p className="text-sm text-slate-500 mt-2">{progress.message}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                <div className="lg:col-span-2 h-full">
                  <IntertopicDistanceMap
                    umapCoordinates={results?.umap || (activeTab === "visualize" ? mockUmap : null)}
                    topicLabels={processLabels(results?.labels) || mockLabels}
                    topicSizes={results?.sizes || mockSizes}
                  />
                </div>
                <div className="flex flex-col gap-6 h-full">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex-1 overflow-auto">
                    <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">Discovered Topics</h3>
                    <div className="space-y-3">
                      {(processLabels(results?.labels) || mockLabels).map((label: string, i: number) => (
                        <div key={i} className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
                          <div className="font-medium">{label}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            Size: {(results?.sizes || mockSizes)[i]} documents
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
