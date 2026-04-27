import React from 'react';
import { Shield, Zap, Lock, Cpu, BarChart3, Database } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
  onOpenLegal: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart, onOpenLegal }) => {
  return (
    <div className="flex flex-col min-h-full w-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      {/* Hero Section */}
      <header className="px-6 py-16 md:py-24 max-w-6xl mx-auto w-full text-center">
        <div className="inline-flex items-center justify-center p-3 bg-blue-100 dark:bg-blue-900/30 rounded-2xl mb-8">
          <BarChart3 className="w-12 h-12 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6">
          Edge-Native <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-emerald-500">Topic Modeling</span>
        </h1>
        <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
          Advanced NLP and document clustering performed entirely in your browser.
          No servers. No data leaks. Absolute privacy.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onStart}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-blue-600/20 flex items-center gap-2"
          >
            <Zap className="w-5 h-5" />
            Launch Application
          </button>
          <button
            onClick={onOpenLegal}
            className="px-8 py-4 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all shadow-sm"
          >
            Read Privacy Guarantee
          </button>
        </div>
      </header>

      {/* Feature Grid */}
      <section className="py-16 bg-white dark:bg-slate-800 border-y border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10">

          {/* Feature 1 */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-6">
              <Shield className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Zero-Server Architecture</h3>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Your sensitive documents never leave your device. All processing, embedding, and clustering happens locally using WebAssembly.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mb-6">
              <Cpu className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">WebGPU Accelerated</h3>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Leverages your device's native GPU for blazing-fast semantic embeddings and dimensionality reduction via Transformers.js.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-6">
              <Database className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Massive Local Storage</h3>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Ingest thousands of documents. Uses advanced memory management and Cap-and-Tier scaling to prevent browser crashes.
            </p>
          </div>
        </div>
      </section>

      {/* Security Banner */}
      <section className="py-12 bg-slate-900 text-center px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-6">
          <Lock className="w-12 h-12 text-blue-400 shrink-0" />
          <div className="text-left">
            <h3 className="text-2xl font-bold text-white mb-2">Enterprise-Grade Security by Design</h3>
            <p className="text-slate-300">
              Compliant with strict data residency requirements. Because data never transfers over the network, it is inherently protected from interception.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center text-slate-500 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
        <p>© {new Date().getFullYear()} Edge-Native Topic Modeler. All rights reserved.</p>
        <button onClick={onOpenLegal} className="mt-2 hover:text-slate-800 dark:hover:text-slate-200 underline">
          Legal Notice & Privacy Policy
        </button>
      </footer>
    </div>
  );
};
