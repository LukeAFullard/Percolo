import React, { useRef } from 'react';
import { usePercolo } from './hooks/usePercolo';
import { Upload, Settings, BarChart2, Activity, Play, FileText, Loader2 } from 'lucide-react';
import { IntertopicDistanceMap } from './components/IntertopicDistanceMap';
import { TopicBarchart } from './components/TopicBarchart';
import { FileParser } from '@src/io/fileParser';
import { ReportGenerator } from '@src/io/report';
import { Download } from 'lucide-react';


function App() {
  const [activeTab, setActiveTab] = React.useState<'upload' | 'visualize' | 'settings'>('upload');
  const [selectedTopic, setSelectedTopic] = React.useState<number | null>(null);
  const [settings, setSettings] = React.useState({
    seedWords: '',
    useGenerativeSummarization: false,
    redactPII: false,
    zeroShotCategories: '',
    tgtLang: '',
    runABSA: false,
    useKeyBERT: false
  });
  const [docs, setDocs] = React.useState<string[]>([
    "This is a test document about artificial intelligence and machine learning models.",
    "Another text discussing the stock market, trading, and finance economics.",
    "The weather today is sunny with a chance of rain in the late afternoon.",
    "Deep learning neural networks require significant computational resources.",
    "Investment strategies often involve diversifying a portfolio across multiple assets.",
    "Artificial intelligence is transforming the way we work.",
    "Finance is a vast field dealing with money and investments.",
    "Machine learning models need a lot of data to train effectively.",
    "Trading algorithms can execute millions of trades per second.",
    "Rainfall is expected to increase over the weekend.",
    "The computational power required for AI is growing exponentially.",
    "Stock market indices reached an all-time high yesterday.",
    "Sunny days make people feel more energetic.",
    "Neural networks are inspired by the human brain.",
    "Portfolio diversification reduces investment risk.",
    "Deep learning has achieved state-of-the-art results in computer vision.",
    "Economic indicators show a positive trend for the next quarter.",
    "Weather forecasting has become more accurate with advanced models.",
    "Natural language processing is a key component of AI.",
    "Financial markets are influenced by global events."
  ]);
  const [inputText, setInputText] = React.useState(docs.join('\n\n'));
  const [isParsingFiles, setIsParsingFiles] = React.useState(false);
  const [parseProgress, setParseProgress] = React.useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelParsingRef = useRef(false);

  const { runPipeline, isProcessing, progress, results, error } = usePercolo();

  const traverseFileTree = async (item: unknown, path: string = '', filesToProcess: File[] = []) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = item as any; // Cast internally to avoid @typescript-eslint/no-explicit-any on signature
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) => entry.file(resolve));
      filesToProcess.push(file);
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      let allEntries: unknown[] = [];
      let entries = await new Promise<unknown[]>((resolve) => {
        dirReader.readEntries((results: unknown[]) => resolve(results));
      });

      while (entries.length > 0) {
        allEntries = allEntries.concat(entries);
        entries = await new Promise<unknown[]>((resolve) => {
          dirReader.readEntries((results: unknown[]) => resolve(results));
        });
      }

      for (const childEntry of allEntries) {
        await traverseFileTree(childEntry, path + entry.name + "/", filesToProcess);
      }
    }
    return filesToProcess;
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      let allFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
           const files = await traverseFileTree(item);
           allFiles = allFiles.concat(files);
        }
      }

      const supportedExtensions = ['.txt', '.md', '.json', '.pdf', '.docx', '.png', '.jpg', '.jpeg'];
      const filteredFiles = allFiles.filter(f => supportedExtensions.some(ext => f.name.toLowerCase().endsWith(ext)));

      if (filteredFiles.length > 0) {
        await processFiles(filteredFiles);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Fallback
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
    // Reset input so the same files can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBrowseFolder = async () => {
    try {
      // @ts-expect-error TS doesn't know about window.showDirectoryPicker
      const dirHandle = await window.showDirectoryPicker();
      const files: File[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const traverseDirectoryHandle = async (handle: any, path: string = '') => {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            // Append path for context, though we only really process file objects.
            files.push(file);
          } else if (entry.kind === 'directory') {
            await traverseDirectoryHandle(entry, path + entry.name + '/');
          }
        }
      };

      await traverseDirectoryHandle(dirHandle);

      const supportedExtensions = ['.txt', '.md', '.json', '.pdf', '.docx', '.png', '.jpg', '.jpeg'];
      const filteredFiles = files.filter(f => supportedExtensions.some(ext => f.name.toLowerCase().endsWith(ext)));

      if (filteredFiles.length > 0) {
        await processFiles(filteredFiles);
      }
    } catch (e) {
      // User likely cancelled the picker
      console.log('Directory selection cancelled or failed:', e);
    }
  };

  const processFiles = async (files: File[]) => {
    setIsParsingFiles(true);
    cancelParsingRef.current = false;

    for (let i = 0; i < files.length; i++) {
      if (cancelParsingRef.current) {
        setParseProgress('Cancelled parsing.');
        setTimeout(() => {
          setIsParsingFiles(false);
          setParseProgress('');
        }, 2000);
        return;
      }
      const file = files[i];
      setParseProgress(`Parsing ${file.name} (${i + 1}/${files.length})...`);
      try {
        const parsedDoc = await FileParser.parseFile(file);
        if (parsedDoc.content) {
            setInputText(prev => {
                const newText = prev ? prev + '\n\n' + parsedDoc.content : parsedDoc.content;
                return newText;
            });
        } else if (parsedDoc.error) {
            console.error(`Error parsing ${file.name}: ${parsedDoc.error}`);
        }
      } catch (err) {
        console.error(`Failed to parse ${file.name}`, err);
      }
    }

    setIsParsingFiles(false);
    setParseProgress('');
  };

  const handleRun = () => {
    const documents = inputText.split('\n\n').filter(d => d.trim().length > 0);
    setDocs(documents);

    // Process seed words if any
    const seedWordsList = settings.seedWords
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const zeroShotList = settings.zeroShotCategories
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const pipelineConfig = {
      seedWords: seedWordsList.length > 0 ? [seedWordsList] : undefined, // Array of arrays as per API
      useGenerativeSummarization: settings.useGenerativeSummarization,
      redactPII: settings.redactPII,
      zeroShotCategories: zeroShotList.length > 0 ? zeroShotList : undefined,
      tgtLang: settings.tgtLang.trim() || undefined,
      runABSA: settings.runABSA,
      useKeyBERT: settings.useKeyBERT
    };

    runPipeline(documents, pipelineConfig);
    setActiveTab('visualize');
  };

  // Mock data for initial render if no results yet
  const mockUmap = [[-1.5, 2.1], [3.2, -0.5], [0.8, -2.4]];
  const mockLabels = ["Topic 0: AI/ML", "Topic 1: Finance", "Topic 2: Weather"];
  const mockSizes = [50, 45, 15];
  const mockTopicWords = [
      [{word: "AI", score: 0.8}, {word: "ML", score: 0.7}, {word: "model", score: 0.6}],
      [{word: "stock", score: 0.9}, {word: "market", score: 0.8}, {word: "finance", score: 0.5}],
      [{word: "weather", score: 0.7}, {word: "sunny", score: 0.6}, {word: "rain", score: 0.4}]
  ];

  // Transform array buffer labels into strings for plotting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processLabels = (labels: any) => {
      if (!labels) return null;
      if (ArrayBuffer.isView(labels) || Array.isArray(labels)) {
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         return Array.from(labels as Iterable<any>).map(l => `Topic ${l}`);
      }
      return labels;
  };

  const handleDownloadReport = () => {
    if (!results || !results.reportData) return;

    const htmlContent = ReportGenerator.generateHTML(results.reportData);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `percolo_report_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <button
             onClick={() => setActiveTab('settings')}
             className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm ${
              activeTab === 'settings'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400'
            }`}>
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

              <div
                className={`border-2 border-dashed ${isParsingFiles ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-blue-500 dark:hover:border-blue-400'} rounded-xl p-8 text-center transition-colors cursor-pointer`}
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileInput}
                  accept=".txt,.md,.json,.pdf,.docx,.png,.jpg,.jpeg"
                />

                {isParsingFiles ? (
                  <div className="flex flex-col items-center justify-center">
                    <Loader2 className="w-12 h-12 mx-auto text-blue-500 mb-4 animate-spin" />
                    <h3 className="text-lg font-medium mb-2 text-blue-700 dark:text-blue-400">Processing Files</h3>
                    <p className="text-sm text-blue-600 dark:text-blue-300 mb-4">{parseProgress}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelParsingRef.current = true;
                      }}
                      className="px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/50 text-red-700 dark:text-red-400 rounded-md transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <FileText className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Drag and drop files here</h3>
                    <p className="text-sm text-slate-500 mb-4">Or paste your text below</p>
                    <div className="flex justify-center gap-4">
                      <button className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-md transition-colors text-sm font-medium pointer-events-none">
                        Browse Files
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent the container's onClick (file picker) from firing
                          handleBrowseFolder();
                        }}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-md transition-colors text-sm font-medium">
                        Browse Folder
                      </button>
                    </div>
                  </>
                )}
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

        {activeTab === 'settings' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-2xl mx-auto space-y-8">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Pipeline Settings</h2>
                <p className="text-slate-500">Configure advanced NLP features before running the analysis.</p>
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-6 shadow-sm">

                {/* Guided Topic Modeling */}
                <div>
                  <h3 className="text-lg font-medium mb-1">Guided Topic Modeling</h3>
                  <p className="text-sm text-slate-500 mb-3">Provide a comma-separated list of seed words to steer the topic creation (e.g., "finance, money, stock").</p>
                  <input
                    type="text"
                    value={settings.seedWords}
                    onChange={(e) => setSettings(prev => ({ ...prev, seedWords: e.target.value }))}
                    placeholder="Enter seed words..."
                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Zero-Shot Classification */}
                <div>
                  <h3 className="text-lg font-medium mb-1">Zero-Shot Classification</h3>
                  <p className="text-sm text-slate-500 mb-3">Provide comma-separated categories to bypass auto-discovery and strictly classify documents into these topics.</p>
                  <input
                    type="text"
                    value={settings.zeroShotCategories}
                    onChange={(e) => setSettings(prev => ({ ...prev, zeroShotCategories: e.target.value }))}
                    placeholder="e.g., Sports, Politics, Technology..."
                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <hr className="border-slate-200 dark:border-slate-700" />

                {/* Summarization Mode */}
                <div>
                  <h3 className="text-lg font-medium mb-1">Summarization Mode</h3>
                  <p className="text-sm text-slate-500 mb-3">Choose how cluster summaries are generated.</p>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!settings.useGenerativeSummarization}
                        onChange={() => setSettings(prev => ({ ...prev, useGenerativeSummarization: false }))}
                        className="text-blue-600"
                      />
                      <span>Extractive (Fast, low RAM)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={settings.useGenerativeSummarization}
                        onChange={() => setSettings(prev => ({ ...prev, useGenerativeSummarization: true }))}
                        className="text-blue-600"
                      />
                      <span>Generative Micro-LLM (Slow, requires WebGPU)</span>
                    </label>
                  </div>
                </div>

                <hr className="border-slate-200 dark:border-slate-700" />

                {/* Advanced Output Features */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Advanced NLP Features</h3>
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.useKeyBERT}
                        onChange={(e) => setSettings(prev => ({ ...prev, useKeyBERT: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Extract Keyphrases (KeyBERT)</span>
                        <span className="block text-sm text-slate-500">Uses embeddings to extract highly representative multi-word concepts.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.runABSA}
                        onChange={(e) => setSettings(prev => ({ ...prev, runABSA: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Aspect-Based Sentiment Analysis (ABSA)</span>
                        <span className="block text-sm text-slate-500">Auto-extracts noun-phrases and scores sentiment specific to those aspects.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.redactPII}
                        onChange={(e) => setSettings(prev => ({ ...prev, redactPII: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Data Privacy: PII Redaction</span>
                        <span className="block text-sm text-slate-500">Automatically masks emails, URLs, and phone numbers before analysis.</span>
                      </div>
                    </label>

                    <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cross-Lingual Target Language (FLORES-200 format)</label>
                        <input
                            type="text"
                            value={settings.tgtLang}
                            onChange={(e) => setSettings(prev => ({ ...prev, tgtLang: e.target.value }))}
                            placeholder="e.g., eng_Latn, fra_Latn"
                            className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                        <p className="text-xs text-slate-500 mt-1">Leave blank to disable translation.</p>
                    </div>
                  </div>
                </div>

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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
                <div className="lg:col-span-2 h-full flex flex-col gap-6">
                  <div className="flex-1 min-h-0">
                      <IntertopicDistanceMap
                        umapCoordinates={(results?.umap as number[][]) || (activeTab === "visualize" ? mockUmap : null)}
                        topicLabels={(results?.topicLabels as string[]) || (processLabels(results?.labels) as string[]) || mockLabels}
                        topicSizes={(results?.topicSizes as number[]) || mockSizes}
                        hoverSummaries={(results?.hoverSummaries as string[])}
                      />
                  </div>
                  {selectedTopic !== null && (
                      <div className="h-1/3 min-h-[300px]">
                          <TopicBarchart
                              topicWords={results?.topicWords ? results.topicWords[selectedTopic] : mockTopicWords[selectedTopic]}
                              topicId={selectedTopic}
                          />
                      </div>
                  )}
                </div>
                <div className="flex flex-col gap-6 h-full">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex-1 flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Discovered Topics</h3>
                      {results && results.reportData && (
                        <button
                          onClick={handleDownloadReport}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-md transition-colors text-sm font-medium"
                          title="Download HTML Report"
                        >
                          <Download className="w-4 h-4" />
                          Report
                        </button>
                      )}
                    </div>
                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                      {((results?.topicLabels as string[]) || (processLabels(results?.labels) as string[]) || mockLabels).map((label: string, i: number) => (
                        <div
                           key={i}
                           onClick={() => setSelectedTopic(i)}
                           className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                               selectedTopic === i
                                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 shadow-sm'
                                  : 'bg-slate-50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                           }`}>
                          <div className="font-medium text-sm">{label}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            Size: {((results?.topicSizes as number[]) || mockSizes)[i]} documents
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
