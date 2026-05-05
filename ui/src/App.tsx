import React, { useRef } from 'react';
import { usePercolo } from './hooks/usePercolo';
import { Upload, Settings, BarChart2, Activity, Play, FileText, Loader2, Zap, Link, Globe } from 'lucide-react';
import { IntertopicDistanceMap } from './components/IntertopicDistanceMap';
import { GdeltAPI } from './io/gdelt';
import { CorpusAnalytics } from './components/CorpusAnalytics';
import { TemporalTrends } from './components/TemporalTrends';
import { EntityNetwork } from './components/EntityNetwork';
import { AnomalyAnalytics } from './components/AnomalyAnalytics';
import { TopicBarchart } from './components/TopicBarchart';
import { TopicWordCloud } from './components/TopicWordCloud';
import { SimilarityHeatmap } from './components/SimilarityHeatmap';
import { DynamicTopicModeling } from './components/DynamicTopicModeling';
import { DocumentDistribution } from './components/DocumentDistribution';
import { TopicPieChart } from './components/TopicPieChart';
import { LandingPage } from './components/LandingPage';
import { CookieBanner } from './components/CookieBanner';
import { LegalNoticeModal } from './components/LegalNoticeModal';
import { FileParser } from '@src/io/fileParser';
import { ReportGenerator } from '@src/io/report';
import { PipelineCache } from '../../src/io/cache';
import { Exporter } from '@src/io/exporter';
import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { ContentGenerator } from './components/ContentGenerator';


function App() {
  const [activeTab, setActiveTab] = React.useState<'landing' | 'upload' | 'visualize' | 'analytics' | 'inference' | 'search' | 'generation' | 'settings'>('landing');
  const [isLegalModalOpen, setIsLegalModalOpen] = React.useState(false);
  const [selectedTopic, setSelectedTopic] = React.useState<number | null>(null);
  const [selectedDocIndex, setSelectedDocIndex] = React.useState<number | null>(null);
  const [wordCloudMode, setWordCloudMode] = React.useState(false);
  const [settings, setSettings] = React.useState({
    seedWords: '',
    useGenerativeSummarization: false,
    redactPII: false,
    useAIPrivacyFilter: false,
    zeroShotCategories: '',
    fewShotCategoriesStr: '',
    tgtLang: '',
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    embeddingPrecision: 'fp32',
    runABSA: false,
    runAnalytics: true,
    runToxicity: false,
    runNER: false,
    useKeyBERT: false,
    customStopWords: '',
    targetTopicCount: '',
    ngramRange: '1,1',
    posFilter: 'ALL',
    useBM25: false,
    fuzzyClustering: false,
    useChunking: false,
    chunkMaxTokens: 256,
    chunkOverlapTokens: 50,
    useLowMemoryFallback: false,
    deduplicate: true
  });
  const [docs, setDocs] = React.useState<string[]>([]);
  const [docMetadata, setDocMetadata] = React.useState<Record<string, string>[]>([]);
  const [inputText, setInputText] = React.useState('');
  const [isParsingFiles, setIsParsingFiles] = React.useState(false);
  const [parseProgress, setParseProgress] = React.useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputUrl, setInputUrl] = React.useState('');
  const [isFetchingUrl, setIsFetchingUrl] = React.useState(false);
  const [fetchUrlError, setFetchUrlError] = React.useState('');

  const [gdeltQuery, setGdeltQuery] = React.useState('');
  const [isFetchingGdelt, setIsFetchingGdelt] = React.useState(false);
  const [gdeltError, setGdeltError] = React.useState('');
  const [gdeltSuccess, setGdeltSuccess] = React.useState('');
  const cancelParsingRef = useRef(false);

  const { runPipeline, runInference, runSearch, loadResults, isProcessing, progress, results, error } = usePercolo();
  const fileReaderRef = useRef<HTMLInputElement>(null);

  const [isDarkMode, setIsDarkMode] = React.useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const [inferenceText, setInferenceText] = React.useState('');
  const [inferenceResult, setInferenceResult] = React.useState<{label: number, similarity: number, topicName: string} | null>(null);
  const [isInferring, setIsInferring] = React.useState(false);

  const [searchText, setSearchText] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<{docIndex: number, similarity: number}[] | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);

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

      const supportedExtensions = ['.txt', '.md', '.json', '.csv', '.xlsx', '.xls', '.pdf', '.docx', '.png', '.jpg', '.jpeg', '.mp3', '.wav', '.ogg', '.m4a'];
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

      const supportedExtensions = ['.txt', '.md', '.json', '.csv', '.xlsx', '.xls', '.pdf', '.docx', '.png', '.jpg', '.jpeg', '.mp3', '.wav', '.ogg', '.m4a'];
      const filteredFiles = files.filter(f => supportedExtensions.some(ext => f.name.toLowerCase().endsWith(ext)));

      if (filteredFiles.length > 0) {
        await processFiles(filteredFiles);
      }
    } catch (e) {
      // User likely cancelled the picker
      console.log('Directory selection cancelled or failed:', e);
    }
  };

  const buildPipelineConfig = () => {
    const seedWordsList = settings.seedWords
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const zeroShotList = settings.zeroShotCategories
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Parse Few-Shot String: "Category1: example1, example2 | Category2: example3"
    const fewShotCategories: Record<string, string[]> = {};
    if (settings.fewShotCategoriesStr.trim() !== '') {
      const categories = settings.fewShotCategoriesStr.split('|');
      categories.forEach(cat => {
        const [label, examples] = cat.split(':');
        if (label && examples) {
           fewShotCategories[label.trim()] = examples.split(',').map(e => e.trim()).filter(e => e.length > 0);
        }
      });
    }

    const customStopWordsList = settings.customStopWords
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);

    const ngramRange = settings.ngramRange.split(',').map(n => parseInt(n.trim(), 10));

    let posFilter: string[] = [];
    if (settings.posFilter === 'NOUN') posFilter = ['NOUN', 'PROPN'];
    if (settings.posFilter === 'NOUN_ADJ') posFilter = ['NOUN', 'PROPN', 'ADJ'];

    const targetTopicCountNum = parseInt(settings.targetTopicCount, 10);

    return {
      seedWords: seedWordsList.length > 0 ? [seedWordsList] : undefined,
      useGenerativeSummarization: settings.useGenerativeSummarization,
      redactPII: settings.redactPII,
      useAIPrivacyFilter: settings.useAIPrivacyFilter,
      zeroShotCategories: zeroShotList.length > 0 ? zeroShotList : undefined,
      fewShotCategories: Object.keys(fewShotCategories).length > 0 ? fewShotCategories : undefined,
      tgtLang: settings.tgtLang.trim() || undefined,
      modelName: settings.embeddingModel,
      precision: settings.embeddingPrecision,
      runABSA: settings.runABSA,
      runAnalytics: settings.runAnalytics,
      runToxicity: settings.runToxicity,
      runNER: settings.runNER,
      useKeyBERT: settings.useKeyBERT,
      customStopWords: customStopWordsList.length > 0 ? customStopWordsList : undefined,
      targetTopicCount: !isNaN(targetTopicCountNum) && targetTopicCountNum > 0 ? targetTopicCountNum : undefined,
      ngramRange: ngramRange.length === 2 && !isNaN(ngramRange[0]) && !isNaN(ngramRange[1]) ? ngramRange : [1, 1],
      posFilter: posFilter.length > 0 ? posFilter : undefined,
      useBM25: settings.useBM25,
      fuzzyClustering: settings.fuzzyClustering,
      useChunking: settings.useChunking,
      chunkMaxTokens: settings.chunkMaxTokens,
      chunkOverlapTokens: settings.chunkOverlapTokens,
      useLowMemoryFallback: settings.useLowMemoryFallback,
      deduplicate: settings.deduplicate
    };
  };

  React.useEffect(() => {
    // Attempt to load from IDB on mount
    PipelineCache.loadCheckpoint('latest_run').then(state => {
      if (state && state.data) {
        // We found a previous run
        // We might want to prompt the user, but for now just load it
        loadResults(state.data);
      }
    });
  }, []);

  React.useEffect(() => {
    if (results && results.labels && results.embeddings) {
        PipelineCache.saveCheckpoint('latest_run', 'completed', results);
    }
  }, [results]);

  const handleExportState = () => {
    if (!results) return;
    // Basic export. Exclude embeddings to keep file size reasonable if desired, or keep them.
    // For now we keep everything.
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "percolo_state.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target?.result as string);
            loadResults(data);
            PipelineCache.saveCheckpoint('latest_run', 'completed', data);
            setActiveTab('visualize');
        } catch (err) {
            console.error("Failed to parse state JSON", err);
            alert("Invalid state file.");
        }
    };
    reader.readAsText(file);
    if (fileReaderRef.current) fileReaderRef.current.value = '';
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
        const parsedDocs = await FileParser.parseFile(file);

        let batchContent = '';
        for (const doc of parsedDocs) {
            if (doc.content) {
                batchContent += (batchContent ? '\n\n' : '') + doc.content;
            } else if (doc.error) {
                console.error(`Error parsing ${doc.filename}: ${doc.error}`);
            }
        }

        if (batchContent) {
           setInputText(prev => prev ? prev + '\n\n' + batchContent : batchContent);
        }
      } catch (err) {
        console.error(`Failed to parse ${file.name}`, err);
      }
    }

    setIsParsingFiles(false);
    setParseProgress('');
  };



  const handleFetchGdelt = async () => {
    if (!gdeltQuery.trim()) return;

    setIsFetchingGdelt(true);
    setGdeltError('');
    setGdeltSuccess('');

    try {
      const articles = await GdeltAPI.fetchArticles(gdeltQuery.trim(), 75);

      if (articles.length === 0) {
        setGdeltError('No articles found for that query.');
        return;
      }

      let batchContent = '';
      for (const article of articles) {
          batchContent += (batchContent ? '\n\n' : '') + `${article.title}\nURL: ${article.url}`;
      }

      if (batchContent) {

         setInputText(prev => prev ? prev + '\n\n' + batchContent : batchContent);
         setGdeltSuccess(`Successfully imported ${articles.length} articles.`);
         setGdeltQuery('');
         // clear success message after 5 seconds
         setTimeout(() => setGdeltSuccess(''), 5000);
      }

    } catch (err) {
      console.error('Failed to fetch from GDELT:', err);
      setGdeltError(`Failed to fetch: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsFetchingGdelt(false);
    }
  };

  const handleFetchUrl = async () => {
    if (!inputUrl.trim()) return;

    setIsFetchingUrl(true);
    setFetchUrlError('');

    try {
      const res = await fetch(inputUrl.trim());
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const blob = await res.blob();
      let filename = 'downloaded_file';
      try {
          const urlObj = new URL(inputUrl.trim());
          const pathname = urlObj.pathname;
          if (pathname && pathname !== '/') {
             filename = pathname.split('/').pop() || 'downloaded_file';
          }
      } catch {
        // Ignored intentionally
      }

      const file = new File([blob], filename, { type: blob.type });

      await processFiles([file]);
      setInputUrl('');
    } catch (err) {
      console.error('Failed to fetch URL:', err);
      setFetchUrlError(`Failed to fetch: ${(err as Error).message}`);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleRun = () => {
    const rawDocuments = inputText.split('\n\n').filter(d => d.trim().length > 0);
    const parsedDocs: string[] = [];
    const parsedMetadata: Record<string, string>[] = [];

    for (const doc of rawDocuments) {
        // Look for URL: link at the end of the document
        const lines = doc.split('\n');
        const urlMatch = lines[lines.length - 1].match(/^URL:\s*(https?:\/\/[^\s]+)$/i);

        if (urlMatch) {
             const url = urlMatch[1];
             const cleanDoc = lines.slice(0, lines.length - 1).join('\n').trim();
             if (cleanDoc.length > 0) {
                 parsedDocs.push(cleanDoc);
                 parsedMetadata.push({ url: url });
             }
        } else {
             parsedDocs.push(doc);
             parsedMetadata.push({});
        }
    }

    setDocs(parsedDocs);
    setDocMetadata(parsedMetadata);
    runPipeline(parsedDocs, buildPipelineConfig());
    setActiveTab('visualize');
  };









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

  const [reportExportFormat, setReportExportFormat] = React.useState<'embedded' | 'split'>('embedded');
  const [includePlotlyScript, setIncludePlotlyScript] = React.useState(true);
  const handleDownloadReport = () => {
    if (!results || !results.reportData) return;

    // Inject missing UMAP & Similarity Data into Report Data
    const enrichedReportData = {
        ...results.reportData,
        umap: results.umap || [],
        labels: results.labels || [],
        similarityMatrix: results.similarityMatrix || [],
        topicLabels: results.topicLabels || [],
        uniqueClasses: results.uniqueClasses || []
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const reportOptions = { includePlotlyScript };

    if (reportExportFormat === 'split') {
        const htmlContent = ReportGenerator.generateHTML(enrichedReportData, {
            ...reportOptions,
            externalDataUrl: `topic_modeling_data_${dateStr}.js`
        });
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);

        const dataScriptContent = `window.reportData = ${JSON.stringify({
                topics: [...enrichedReportData.topics].sort((a,b) => b.size - a.size),
                umap: enrichedReportData.umap || [],
                labels: enrichedReportData.labels || [],
                similarityMatrix: enrichedReportData.similarityMatrix || [],
                topicLabels: enrichedReportData.topicLabels || [],
                uniqueClasses: enrichedReportData.uniqueClasses || []
        })};`;

        const jsBlob = new Blob([dataScriptContent], { type: 'application/javascript' });
        const jsUrl = URL.createObjectURL(jsBlob);

        const a1 = document.createElement('a');
        a1.href = htmlUrl;
        a1.download = `topic_modeling_report_${dateStr}.html`;
        document.body.appendChild(a1);
        a1.click();
        document.body.removeChild(a1);

        setTimeout(() => {
            const a2 = document.createElement('a');
            a2.href = jsUrl;
            a2.download = `topic_modeling_data_${dateStr}.js`;
            document.body.appendChild(a2);
            a2.click();
            document.body.removeChild(a2);
            URL.revokeObjectURL(htmlUrl);
            URL.revokeObjectURL(jsUrl);
        }, 500);

    } else {
        const htmlContent = ReportGenerator.generateHTML(enrichedReportData, reportOptions);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `topic_modeling_report_${dateStr}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
  };

  const handleExportCSV = () => {
    if (!results || !results.labels || !docs) return;

    // Construct the PipelineResult object expected by the Exporter
    const pipelineResult = {
        documents: docs.map((text, i) => ({
            text: text,
            topicLabel: results.labels[i],
            probability: results.probabilities ? results.probabilities[i] : 1.0,
            embedding: results.umap ? results.umap[i] : undefined
        })),
        topics: results.uniqueClasses.map((label: number, idx: number) => ({
            label: label,
            name: results.topicLabels[idx],
            size: results.topicSizes[idx],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            words: results.topicWords ? results.topicWords[idx].map((w: any) => w.word) : []
        }))
    };

    const csvContent = Exporter.toCSV(pipelineResult);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topic_modeling_data_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportRAG = () => {
    if (!results || !results.labels || !docs) return;

    const pipelineResult = {
        documents: docs.map((text, i) => ({
            text: text,
            topicLabel: results.labels[i],
            probability: results.probabilities ? results.probabilities[i] : 1.0,
            embedding: results.umap ? results.umap[i] : undefined
        })),
        topics: results.uniqueClasses.map((label: number, idx: number) => ({
            label: label,
            name: results.topicLabels[idx],
            size: results.topicSizes[idx],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            words: results.topicWords ? results.topicWords[idx].map((w: any) => w.word) : []
        }))
    };

    const ragContent = Exporter.toRAGReady(pipelineResult);
    const blob = new Blob([ragContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topic_modeling_rag_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (activeTab === 'landing') {
    return (
      <>
        <LandingPage
          onStart={() => setActiveTab('upload')}
          onOpenLegal={() => setIsLegalModalOpen(true)}
        />
        <CookieBanner onOpenLegal={() => setIsLegalModalOpen(true)} />
        <LegalNoticeModal isOpen={isLegalModalOpen} onClose={() => setIsLegalModalOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
      <CookieBanner onOpenLegal={() => setIsLegalModalOpen(true)} />
      <LegalNoticeModal isOpen={isLegalModalOpen} onClose={() => setIsLegalModalOpen(false)} />

      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Topic Modeler
          </h1>
          <p className="text-xs text-slate-500 mt-1">Edge-Native Topic Modeling</p>
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

          <button
            onClick={() => setActiveTab('analytics')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              activeTab === 'analytics'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
            }`}
          >
            <Activity className="w-5 h-5" />
            Corpus Analytics
          </button>

          <button
            onClick={() => setActiveTab('inference')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              activeTab === 'inference'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
            }`}
          >
            <Zap className="w-5 h-5" />
            Live Inference
          </button>

          <button
            onClick={() => setActiveTab('search')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              activeTab === 'search'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            Semantic Search
          </button>

          <button
            onClick={() => setActiveTab('generation')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              activeTab === 'generation'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
            }`}
          >
            <FileText className="w-5 h-5" />
            Generate Content
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
                  accept=".txt,.md,.json,.csv,.xlsx,.xls,.pdf,.docx,.eml,.msg,.png,.jpg,.jpeg,.mp3,.wav,.ogg,.m4a"
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


              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Or import from URL (CORS compatible)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Link className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="url"
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                      placeholder="https://example.com/data.csv or .json"
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleFetchUrl(); }}
                    />
                  </div>
                  <button
                    onClick={handleFetchUrl}
                    disabled={isFetchingUrl || !inputUrl.trim()}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center gap-2"
                  >
                    {isFetchingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
                  </button>
                </div>
                {fetchUrlError && <p className="text-sm text-red-500">{fetchUrlError}</p>}
              </div>


              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Search Global News (via GDELT API)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Globe className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                      placeholder="e.g. climate change"
                      value={gdeltQuery}
                      onChange={(e) => setGdeltQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleFetchGdelt(); }}
                    />
                  </div>
                  <button
                    onClick={handleFetchGdelt}
                    disabled={isFetchingGdelt || !gdeltQuery.trim()}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center gap-2"
                  >
                    {isFetchingGdelt ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </button>
                </div>
                {gdeltError && <p className="text-sm text-red-500">{gdeltError}</p>}
                {gdeltSuccess && <p className="text-sm text-green-500">{gdeltSuccess}</p>}
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

              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">Resume Previous Session</h3>
                  <p className="text-slate-500 mb-4 text-sm">Load a previously exported state to instantly resume visualization and inference without recalculating embeddings.</p>

                  <button
                    onClick={() => fileReaderRef.current?.click()}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Import State (.json)
                  </button>
                  <input
                    type="file"
                    ref={fileReaderRef}
                    onChange={handleImportState}
                    accept=".json"
                    className="hidden"
                  />
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

                {/* Few-Shot Classification */}
                <div>
                  <h3 className="text-lg font-medium mb-1">Few-Shot Classification</h3>
                  <p className="text-sm text-slate-500 mb-3">Define custom categories with specific examples to guide clustering based on centroids. Overrides Zero-Shot.</p>
                  <textarea
                    value={settings.fewShotCategoriesStr}
                    onChange={(e) => setSettings(prev => ({ ...prev, fewShotCategoriesStr: e.target.value }))}
                    placeholder="e.g., Finance: stock market, trading algorithms, wall street | Weather: raining, sunny day, forecast"
                    rows={3}
                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                  />
                </div>

                {/* Embedding Options */}
                <hr className="border-slate-200 dark:border-slate-700" />
                <div>
                  <h3 className="text-lg font-medium mb-1">Embedding Engine</h3>
                  <p className="text-sm text-slate-500 mb-3">Choose the dense vector model and precision.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Model</label>
                          <select
                             value={settings.embeddingModel}
                             onChange={(e) => setSettings(prev => ({...prev, embeddingModel: e.target.value}))}
                             className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          >
                             <option value="Xenova/all-MiniLM-L6-v2">English Only (Fastest, ~90MB)</option>
                             <option value="Xenova/paraphrase-multilingual-MiniLM-L12-v2">Multilingual (Slower, supports 50+ languages)</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Quantization / Precision</label>
                          <select
                             value={settings.embeddingPrecision}
                             onChange={(e) => setSettings(prev => ({...prev, embeddingPrecision: e.target.value}))}
                             className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          >
                             <option value="fp32">32-bit Float (Highest Quality, High RAM)</option>
                             <option value="fp16">16-bit Float (Balanced)</option>
                             <option value="q8">8-bit Quantized (Lowest RAM, ~117MB for Multilingual)</option>
                          </select>
                      </div>
                  </div>
                </div>

                <hr className="border-slate-200 dark:border-slate-700" />

                {/* Topic Reduction */}
                <div>
                  <h3 className="text-lg font-medium mb-1">Hierarchical Topic Reduction</h3>
                  <p className="text-sm text-slate-500 mb-3">Force HDBSCAN to merge topics down to a specific target count using Centroid Cosine Similarity.</p>
                  <input
                    type="number"
                    value={settings.targetTopicCount}
                    onChange={(e) => setSettings(prev => ({ ...prev, targetTopicCount: e.target.value }))}
                    placeholder="Leave blank for automatic detection..."
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
                        checked={settings.deduplicate}
                        onChange={(e) => setSettings(prev => ({ ...prev, deduplicate: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Data Deduplication</span>
                        <span className="block text-sm text-slate-500">Automatically filter out heavily duplicate documents to speed up processing.</span>
                      </div>
                    </label>

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
                        checked={settings.runAnalytics}
                        onChange={(e) => setSettings(prev => ({ ...prev, runAnalytics: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Basic NLP Analytics</span>
                        <span className="block text-sm text-slate-500">Extracts general sentiment and entities (Dates, Emails, Money) per topic.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.runToxicity}
                        onChange={(e) => setSettings(prev => ({ ...prev, runToxicity: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Toxicity & Bias Audit</span>
                        <span className="block text-sm text-slate-500">Runs an adversarial sequence classification model (toxic-bert) to audit dataset toxicity over time.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.runNER}
                        onChange={(e) => setSettings(prev => ({ ...prev, runNER: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Named Entity Recognition (NER)</span>
                        <span className="block text-sm text-slate-500">Uses a transformer model to extract deep entities (Persons, Organizations, Locations).</span>
                      </div>
                    </label>

                    <div className="flex flex-col gap-2">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.redactPII}
                          onChange={(e) => setSettings(prev => ({ ...prev, redactPII: e.target.checked }))}
                          className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <div>
                          <span className="block font-medium">Data Privacy: PII Redaction</span>
                          <span className="block text-sm text-slate-500">Automatically masks sensitive information before analysis.</span>
                        </div>
                      </label>
                      {settings.redactPII && (
                        <label className="flex items-start gap-3 ml-7 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.useAIPrivacyFilter}
                            onChange={(e) => setSettings(prev => ({ ...prev, useAIPrivacyFilter: e.target.checked }))}
                            className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <div>
                            <span className="block font-medium">Use AI Privacy Filter (OpenAI)</span>
                            <span className="block text-sm text-slate-500">Use a 1B parameter WebGPU model for contextual, highly accurate PII detection instead of basic regex rules.</span>
                          </div>
                        </label>
                      )}
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.fuzzyClustering}
                        onChange={(e) => setSettings(prev => ({ ...prev, fuzzyClustering: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Fuzzy Document Distributions</span>
                        <span className="block text-sm text-slate-500">Computes the probability of each document belonging to EVERY topic, enabling fuzzy clustering visualizations.</span>
                      </div>
                    </label>

                    <div className="flex flex-col gap-2">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.useChunking}
                            onChange={(e) => setSettings(prev => ({ ...prev, useChunking: e.target.checked }))}
                            className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <div>
                            <span className="block font-medium">Semantic Document Chunking</span>
                            <span className="block text-sm text-slate-500">Splits large documents into overlapping token chunks to fit within embedding context windows.</span>
                          </div>
                        </label>
                        {settings.useChunking && (
                          <div className="flex items-center gap-4 ml-7 mt-2">
                             <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                Max Tokens:
                                <input type="number" value={settings.chunkMaxTokens} onChange={e => setSettings(prev => ({ ...prev, chunkMaxTokens: parseInt(e.target.value, 10) || 256 }))} className="w-20 p-1 border rounded dark:bg-slate-800 dark:border-slate-600 outline-none focus:ring-1 focus:ring-blue-500" />
                             </label>
                             <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                Overlap:
                                <input type="number" value={settings.chunkOverlapTokens} onChange={e => setSettings(prev => ({ ...prev, chunkOverlapTokens: parseInt(e.target.value, 10) || 50 }))} className="w-20 p-1 border rounded dark:bg-slate-800 dark:border-slate-600 outline-none focus:ring-1 focus:ring-blue-500" />
                             </label>
                          </div>
                        )}
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer mt-4">
                      <input
                        type="checkbox"
                        checked={settings.useLowMemoryFallback}
                        onChange={(e) => setSettings(prev => ({ ...prev, useLowMemoryFallback: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block font-medium">Low Memory Fallback (KMeans)</span>
                        <span className="block text-sm text-slate-500">Replaces HDBSCAN with KMeans for low-RAM devices or massive datasets. Prevents OOM crashes but loses cluster shape nuance.</span>
                      </div>
                    </label>

                    <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-700/50 space-y-4">

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Term Weighting Algorithm</label>
                          <select
                              value={settings.useBM25 ? 'BM25' : 'CTFIDF'}
                              onChange={(e) => setSettings(prev => ({ ...prev, useBM25: e.target.value === 'BM25' }))}
                              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          >
                            <option value="CTFIDF">c-TF-IDF (Default)</option>
                            <option value="BM25">BM25 (Handles document length saturation)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Lexical N-Gram Range</label>
                          <select
                              value={settings.ngramRange}
                              onChange={(e) => setSettings(prev => ({ ...prev, ngramRange: e.target.value }))}
                              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          >
                            <option value="1,1">Unigrams Only (Fastest)</option>
                            <option value="1,2">Unigrams + Bigrams</option>
                            <option value="1,3">Up to Trigrams</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">POS-Based Topic Filtering</label>
                          <select
                              value={settings.posFilter}
                              onChange={(e) => setSettings(prev => ({ ...prev, posFilter: e.target.value }))}
                              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          >
                            <option value="ALL">All Words</option>
                            <option value="NOUN">Nouns Only</option>
                            <option value="NOUN_ADJ">Nouns & Adjectives</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Custom Stop Words</label>
                          <input
                              type="text"
                              value={settings.customStopWords}
                              onChange={(e) => setSettings(prev => ({ ...prev, customStopWords: e.target.value }))}
                              placeholder="Comma-separated words to ignore..."
                              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cross-Lingual Target Language (FLORES-200)</label>
                          <input
                              type="text"
                              value={settings.tgtLang}
                              onChange={(e) => setSettings(prev => ({ ...prev, tgtLang: e.target.value }))}
                              placeholder="e.g., eng_Latn, fra_Latn"
                              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          />
                        </div>

                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {activeTab === 'generation' && (
          <div className="flex-1 p-8 overflow-y-auto bg-slate-50 dark:bg-slate-900">
             <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)]">
                <ContentGenerator
                  selectedTopic={selectedTopic}
                  topicLabels={(results?.topicLabels as string[]) || (processLabels(results?.labels) as string[]) || []}
                  topicDocs={selectedTopic !== null && results && results.labels ? docs.filter((_, i) => results.labels && results.labels[i] === (results.uniqueClasses ? results.uniqueClasses[selectedTopic] : selectedTopic)) : []}
                  orchestrator={null}
                />
              </div>
          </div>
        )}

        {activeTab === 'search' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Semantic Search</h2>
                <p className="text-slate-500">Query your documents using natural language to find the most conceptually relevant texts.</p>
              </div>

              {!results || !results.embeddings ? (
                 <div className="p-8 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
                    Please run the pipeline first to generate document embeddings.
                 </div>
              ) : (
                <div className="space-y-6">
                    <input
                      type="text"
                      className="w-full p-4 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search for a concept or question (e.g. 'How do neural networks work?')..."
                      onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isSearching && searchText.trim().length > 0) {
                              const doSearch = async () => {
                                 setIsSearching(true);
                                 try {
                                     const res = await runSearch(searchText, buildPipelineConfig());
                                     setSearchResults(res);
                                 } finally {
                                     setIsSearching(false);
                                 }
                              };
                              doSearch();
                          }
                      }}
                    />

                    <button
                      onClick={async () => {
                         setIsSearching(true);
                         try {
                             const res = await runSearch(searchText, buildPipelineConfig());
                             setSearchResults(res);
                         } finally {
                             setIsSearching(false);
                         }
                      }}
                      disabled={isSearching || searchText.trim().length === 0}
                      className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium shadow-sm"
                    >
                      {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>}
                      Search
                    </button>

                    {searchResults && searchResults.length > 0 && (
                        <div className="space-y-4 mt-8">
                             <h3 className="text-lg font-semibold mb-4">Top Results</h3>
                             {searchResults.slice(0, 5).map((result, idx) => (
                               <div key={idx} className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                  <div className="flex justify-between items-start mb-2">
                                     <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">Rank {idx + 1}</span>
                                     <span className="text-xs text-slate-500">Similarity: {(result.similarity * 100).toFixed(1)}%</span>
                                  </div>
                                  <div className="text-sm text-slate-800 dark:text-slate-200">
                                      {docs[result.docIndex]}
                                  </div>
                                  {results.labels && (
                                      <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                          Topic: {
                                              results.uniqueClasses.indexOf(results.labels[result.docIndex]) !== -1
                                                ? results.topicLabels[results.uniqueClasses.indexOf(results.labels[result.docIndex])]
                                                : results.labels[result.docIndex]
                                          }
                                      </div>
                                  )}
                               </div>
                             ))}
                        </div>
                    )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'inference' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Live Inference</h2>
                <p className="text-slate-500">Test real-time assignment of new documents to discovered topics.</p>
              </div>

              {!results ? (
                 <div className="p-8 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
                    Please run the pipeline first to discover topics.
                 </div>
              ) : (
                <div className="space-y-6">
                    <textarea
                      className="w-full h-40 p-4 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow resize-y"
                      value={inferenceText}
                      onChange={(e) => setInferenceText(e.target.value)}
                      placeholder="Type a sentence here (e.g. 'I bought some new tech stocks')..."
                    />

                    <button
                      onClick={async () => {
                         setIsInferring(true);
                         try {
                             const res = await runInference(inferenceText, buildPipelineConfig());
                             if (res && res.length > 0) {
                                 const idx = results.uniqueClasses.indexOf(res[0].label);
                                 const tName = idx !== -1 ? results.topicLabels[idx] : `Topic ${res[0].label}`;
                                 setInferenceResult({ ...res[0], topicName: tName });
                             }
                         } finally {
                             setIsInferring(false);
                         }
                      }}
                      disabled={isInferring || inferenceText.trim().length === 0}
                      className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium shadow-sm"
                    >
                      {isInferring ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                      Predict Topic
                    </button>

                    {inferenceResult && (
                        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8">
                             <h3 className="text-lg font-semibold mb-4">Prediction Result</h3>
                             <div className="grid grid-cols-2 gap-4">
                                 <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                                     <div className="text-sm text-slate-500 mb-1">Assigned Topic</div>
                                     <div className="text-xl font-medium text-slate-800 dark:text-slate-200">{inferenceResult.topicName}</div>
                                 </div>
                                 <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                                     <div className="text-sm text-slate-500 mb-1">Confidence (Cosine Similarity)</div>
                                     <div className="text-xl font-medium text-slate-800 dark:text-slate-200">{(inferenceResult.similarity * 100).toFixed(1)}%</div>
                                 </div>
                             </div>
                        </div>
                    )}
                </div>
              )}
            </div>
          </div>
        )}

                      {activeTab === 'analytics' && (
                <div className="flex-1 w-full h-full p-8 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
                  {!results || !results.reportData || !results.reportData.corpusStats ? (
                    <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
                      <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-6">
                        <Activity className="w-8 h-8 text-blue-500" />
                      </div>
                      <h3 className="text-xl font-medium mb-2">No Analytics Data</h3>
                      <p className="text-slate-500">
                        Upload data and run the pipeline to generate and view Corpus Analytics.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <CorpusAnalytics
                          data={results.reportData.corpusStats}
                          isDarkMode={isDarkMode}
                      />
                      {(
                        (results.reportData.corpusStats.documentSentiments && results.reportData.corpusStats.documentSentiments.length > 0) ||
                        (results.reportData.corpusStats.documentToxicity && results.reportData.corpusStats.documentToxicity.length > 0)
                      ) && (
                          <div className="mt-6 w-full">
                              <TemporalTrends
                                  documentSentiments={results.reportData.corpusStats.documentSentiments}
                                  documentToxicity={results.reportData.corpusStats.documentToxicity}
                                  isDarkMode={isDarkMode}
                              />
                          </div>
                      )}
                      {results.reportData.corpusStats.entityNetworkData && results.reportData.corpusStats.entityNetworkData.nodes && results.reportData.corpusStats.entityNetworkData.nodes.length > 0 && (
                          <div className="mt-6 w-full">
                              <EntityNetwork
                                  data={results.reportData.corpusStats.entityNetworkData}
                                  isDarkMode={isDarkMode}
                              />
                          </div>
                      )}
                      {results.reportData.corpusStats.anomalyData && results.reportData.corpusStats.anomalyData.length > 0 && (
                          <div className="mt-6 w-full">
                              <AnomalyAnalytics
                                  data={results.reportData.corpusStats.anomalyData}
                                  umapData={results.umap || []}
                                  parentLabels={results.labels || []}
                                  isDarkMode={isDarkMode}
                              />
                          </div>
                      )}
                    </div>
                  )}
                </div>
              )}

        {activeTab === 'visualize' && !results && (
          <div className="flex-1 flex items-center justify-center">
             <div className="p-8 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-xl border border-blue-200 dark:border-blue-800 text-center max-w-lg">
                <h3 className="text-lg font-semibold mb-2">No Data Available</h3>
                <p>Please load or run data in the Data Source tab before attempting to visualize topics.</p>
             </div>
          </div>
        )}

        {activeTab === 'visualize' && results && (
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
                <div className="lg:col-span-2 h-full flex flex-col gap-6 overflow-y-auto pr-2">
                  <div className="min-h-[400px]">
                      <IntertopicDistanceMap
                        umapCoordinates={(results?.umap as number[][]) || null}
                        umapCentroids={results?.umapCentroids}
                        documentLabels={(results?.labels as number[]) || []}
                        uniqueClasses={(results?.uniqueClasses as number[]) || []}
                        topicLabels={(results?.topicLabels as string[]) || (processLabels(results?.labels) as string[]) || []}
                        topicSizes={(results?.topicSizes as number[]) || []}
                        hoverSummaries={(results?.hoverSummaries as string[])}
                        isDarkMode={isDarkMode}
                      />
                  </div>

                  <div className="min-h-[400px]">
                      <SimilarityHeatmap
                        similarityMatrix={results?.similarityMatrix || []}
                        topicLabels={(results?.topicLabels as string[]) || (processLabels(results?.labels) as string[]) || []}
                        isDarkMode={isDarkMode}
                      />
                  </div>

                  <div className="min-h-[400px]">
                      <TopicPieChart
                        topicSizes={(results?.topicSizes as number[]) || []}
                        topicLabels={(results?.topicLabels as string[]) || (processLabels(results?.labels) as string[]) || []}
                        uniqueClasses={(results?.uniqueClasses as number[]) || []}
                        isDarkMode={isDarkMode}
                      />
                  </div>

                  {selectedTopic !== null && (
                      <div className="min-h-[300px] flex flex-col">
                          <div className="flex justify-end mb-2">
                             <button
                                onClick={() => setWordCloudMode(!wordCloudMode)}
                                className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md transition-colors"
                             >
                                Toggle {wordCloudMode ? 'Bar Chart' : 'Word Cloud'}
                             </button>
                          </div>
                          {wordCloudMode ? (
                             <TopicWordCloud
                                topicWords={results?.topicWords ? results.topicWords[selectedTopic] : []}
                                topicId={results?.uniqueClasses ? results.uniqueClasses[selectedTopic] : selectedTopic}
                             />
                          ) : (
                             <TopicBarchart
                                topicWords={results?.topicWords ? results.topicWords[selectedTopic] : []}
                                topicId={results?.uniqueClasses ? results.uniqueClasses[selectedTopic] : selectedTopic}
                                color={`hsl(${((results?.uniqueClasses ? results.uniqueClasses[selectedTopic] : selectedTopic) * 137.508) % 360}, 70%, 50%)`}
                                isDarkMode={isDarkMode}
                             />
                          )}
                      </div>
                  )}
                  {selectedDocIndex !== null && (
                      <div className="min-h-[300px]">
                          <DocumentDistribution
                              probabilities={
                                results
                                  ? (results.documentDistributions ? results.documentDistributions[selectedDocIndex] : undefined)
                                  : undefined
                              }
                              topicLabels={(results?.topicLabels as string[]) || (processLabels(results?.labels) as string[]) || []}
                              isDarkMode={isDarkMode}
                          />
                      </div>
                  )}

                  {results && results.labels && (
                      <div className="min-h-[400px]">
                          <DynamicTopicModeling
                              documentLabels={results.labels}
                              uniqueClasses={results.uniqueClasses}
                              topicLabels={results.topicLabels}
                              isDarkMode={isDarkMode}
                          />
                      </div>
                  )}
                </div>
                <div className="flex flex-col gap-6 h-full overflow-hidden">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Discovered Topics</h3>
                      <div className="flex gap-2">
                          {results && (
                            <>
                                <button
                                  onClick={handleExportCSV}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 rounded-md transition-colors text-xs font-medium"
                                  title="Export CSV"
                                >
                                  <FileSpreadsheet className="w-4 h-4" />
                                  CSV
                                </button>
                                <button
                                  onClick={handleExportRAG}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 rounded-md transition-colors text-xs font-medium"
                                  title="Export RAG JSON"
                                >
                                  <FileJson className="w-4 h-4" />
                                  RAG
                                </button>
                            </>
                          )}
                          {results && results.reportData && (
                            <div className="flex items-center gap-2 ml-2">
                              <div className="flex flex-col gap-1 items-end mr-2 border-r border-slate-200 dark:border-slate-700 pr-3">
                                <select
                                  value={reportExportFormat}
                                  onChange={(e) => setReportExportFormat(e.target.value as 'embedded' | 'split')}
                                  className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded px-2 py-1 text-xs outline-none"
                                  title="Report Format"
                                >
                                  <option value="embedded">Embedded Data</option>
                                  <option value="split">Split Data (.js)</option>
                                </select>
                                <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer" title="Inject Plotly script via CDN">
                                  <input
                                    type="checkbox"
                                    checked={includePlotlyScript}
                                    onChange={(e) => setIncludePlotlyScript(e.target.checked)}
                                    className="w-3 h-3 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 focus:ring-1"
                                  />
                                  Include Plotly
                                </label>
                              </div>
                              <button
                                onClick={handleDownloadReport}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-md transition-colors text-sm font-medium"
                                title="Download HTML Report"
                              >
                                <Download className="w-4 h-4" />
                                Report
                              </button>
                            </div>
                          )}
                          {results && (
                             <button
                              onClick={handleExportState}
                              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 rounded-md transition-colors text-sm font-medium ml-2"
                              title="Export App State JSON"
                            >
                              <Download className="w-4 h-4" />
                              Export State
                            </button>
                          )}
                      </div>
                    </div>
                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                      {((results?.topicLabels as string[]) || (processLabels(results?.labels) as string[]) || []).map((label: string, i: number) => (
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
                            Size: {((results?.topicSizes as number[]) || [])[i]} documents
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Documents</h3>
                    </div>
                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                      {docs.slice(0, 50).map((doc: string, i: number) => (
                        <div
                           key={i}
                           onClick={() => setSelectedDocIndex(i)}
                           className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                               selectedDocIndex === i
                                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 shadow-sm'
                                  : 'bg-slate-50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                           }`}>
                          <div className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">{doc}</div>
                          {docMetadata[i] && docMetadata[i].url && (
                              <div className="mt-2 text-xs">
                                  <a href={docMetadata[i].url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline break-all">
                                      {docMetadata[i].url}
                                  </a>
                              </div>
                          )}
                          {results && results.labels && (
                              <div className="text-xs text-slate-500 mt-2 font-medium">
                                Assigned Topic: {results.labels[i]}
                              </div>
                          )}
                        </div>
                      ))}
                      {docs.length > 50 && (
                          <div className="text-xs text-center text-slate-400 py-2">
                              Showing first 50 documents...
                          </div>
                      )}
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
