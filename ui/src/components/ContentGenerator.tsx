import React, { useState, useRef } from 'react';
import { FileText, Type, Edit3, Check, Copy } from 'lucide-react';

interface ContentGeneratorProps {
  selectedTopic: number | null;
  topicLabels: string[];
  topicDocs: string[];
  orchestrator: any | null;
}

type Format = 'newsletter' | 'linkedin' | 'reddit' | 'twitter' | 'youtube' | 'summary';

export const ContentGenerator: React.FC<ContentGeneratorProps> = ({
  selectedTopic,
  topicLabels,
  topicDocs
}) => {
  const [format, setFormat] = useState<Format>('summary');
  const [generatedText, setGeneratedText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('Xenova/Qwen1.5-0.5B-Chat');

  // Ref for cleanup
  const workerRef = useRef<Worker | null>(null);

  const formats = [
    { id: 'summary', icon: <FileText className="w-4 h-4" />, label: 'Topic Summary' },
    { id: 'newsletter', icon: <Type className="w-4 h-4" />, label: 'Email Newsletter' },
    { id: 'linkedin', icon: <Type className="w-4 h-4" />, label: 'LinkedIn Post' },
    { id: 'reddit', icon: <Edit3 className="w-4 h-4" />, label: 'Reddit Post' },
    { id: 'twitter', icon: <Type className="w-4 h-4" />, label: 'X (Twitter) Thread' },
    { id: 'youtube', icon: <Type className="w-4 h-4" />, label: 'YouTube Script' },
  ];

  const models = [
    { id: 'Xenova/Qwen1.5-0.5B-Chat', label: 'Qwen 1.5 (0.5B) - Fast' },
    { id: 'Xenova/Qwen1.5-1.8B-Chat', label: 'Qwen 1.5 (1.8B) - Balanced' },
    { id: 'Xenova/gemma-2b-it', label: 'Gemma (2B) - High Quality' },
    { id: 'Xenova/Phi-3-mini-4k-instruct', label: 'Phi-3 Mini (3.8B) - Superior' }
  ];

  const handleGenerate = async () => {
    if (selectedTopic === null || topicDocs.length === 0) return;

    setIsGenerating(true);
    setGeneratedText('');

    try {
      // Reuse the same worker if possible to avoid reloading the model
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('../content.worker.ts', import.meta.url), { type: 'module' });
      }
      const worker = workerRef.current;

      // Select top 10 docs for context
      const contextDocs = topicDocs.slice(0, 10).join('\n\n');

      worker.onmessage = (e) => {
        if (e.data.status === 'complete') {
            setGeneratedText(e.data.result);
            setIsGenerating(false);
            // Do NOT terminate the worker here, we want to keep the model loaded in VRAM for subsequent requests
        } else if (e.data.status === 'error') {
            setGeneratedText(`Error generating content: ${e.data.error}`);
            setIsGenerating(false);
        } else if (e.data.status === 'loading') {
            // we can display a loading state if we want, currently it's covered by isGenerating
        }
      };

      worker.onerror = (e) => {
        setGeneratedText(`Worker execution error: ${e.message}`);
        setIsGenerating(false);
      };

      worker.postMessage({ text: contextDocs, format, model: selectedModel });

    } catch (e: any) {
      setGeneratedText('Error initializing generator: ' + e.message);
      setIsGenerating(false);
    }
  };

  // Ensure worker is terminated if component unmounts
  React.useEffect(() => {
    return () => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (selectedTopic === null) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
        <p>Select a topic to generate content.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
          Content Generator
        </h3>
        <p className="text-sm text-slate-500">
          Selected: <span className="font-medium text-blue-600 dark:text-blue-400">{topicLabels[selectedTopic] || `Topic ${selectedTopic}`}</span>
        </p>
      </div>

      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Larger models require more RAM/VRAM.</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            {formats.map(f => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id as Format)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors border ${
                  format === f.id
                    ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || topicDocs.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors font-medium shadow-sm"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Edit3 className="w-4 h-4" />
              Generate Content
            </>
          )}
        </button>

        <div className="flex-1 flex flex-col min-h-[200px] border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-900/50 relative">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-t-md">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Output</span>
            {generatedText && (
              <button
                onClick={handleCopy}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm">Loading language model and generating content...</p>
                <p className="text-xs text-slate-500 max-w-xs text-center">This runs entirely in your browser using WebGPU and may take a moment.</p>
              </div>
            ) : generatedText ? (
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {generatedText}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-400 italic">
                Generated content will appear here...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
