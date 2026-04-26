import { useState, useEffect, useRef } from 'react';
import { PipelineOrchestrator } from '../../../src/worker/orchestrator';
import type { PipelineProgress } from '../../../src/worker/orchestrator';

export function usePercolo() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
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

  return {
    runPipeline,
    isProcessing,
    progress,
    results,
    error
  };
}
