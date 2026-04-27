import { useState, useEffect, useRef } from 'react';
import { PipelineOrchestrator } from '../../../src/worker/orchestrator';
import type { PipelineProgress } from '../../../src/worker/orchestrator';

export function usePercolo() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const orchestratorRef = useRef<PipelineOrchestrator | null>(null);

  useEffect(() => {
    // Initialize orchestrator once
    // Note: In a real environment, we'd need to bundle the worker.
    // Here we assume it's exposed or we bypass for now to build UI structure.
    try {
      orchestratorRef.current = new PipelineOrchestrator();
      orchestratorRef.current.setOnProgress((prog) => {
        setProgress(prog);
        if (prog.status === 'completed' && prog.phase === 'pipeline') {
          setIsProcessing(false);
          // results would usually come here or via a separate RESULT message
        } else if (prog.phase === 'result' && prog.status === 'completed') {
          // Store actual payload in results
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setResults((prog as any).payload);
          setIsProcessing(false);
        } else if (prog.status === 'error') {
          setIsProcessing(false);
          setError(prog.message || 'An error occurred during processing');
        }
      });
    } catch (err) {
      console.warn("Could not initialize PipelineOrchestrator. It may require specific worker bundling.", err);
    }

    return () => {
      if (orchestratorRef.current) {
        orchestratorRef.current.terminate();
      }
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runPipeline = (documents: string[], config?: any) => {
    if (!orchestratorRef.current) {
      setError("Pipeline engine not initialized.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress({ phase: 'initialization', status: 'running', progress: 0 });

    // Send documents to the pipeline
    orchestratorRef.current.startPipeline(documents, config);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runInference = async (document: string, config?: any) => {
    if (!orchestratorRef.current) {
        setError("Pipeline engine not initialized.");
        return null;
    }
    return await orchestratorRef.current.runInference(document, config);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runSearch = async (query: string, config?: any) => {
    if (!orchestratorRef.current) {
        setError("Pipeline engine not initialized.");
        return null;
    }
    if (!results || !results.embeddings) {
        setError("Document embeddings not found. Please run the pipeline first.");
        return null;
    }
    return await orchestratorRef.current.runSearch(query, results.embeddings, config);
  };

  return {
    runPipeline,
    runInference,
    runSearch,
    isProcessing,
    progress,
    results,
    error
  };
}
