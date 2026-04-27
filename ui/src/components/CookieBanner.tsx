import React, { useState } from 'react';
import { Info, X } from 'lucide-react';

interface CookieBannerProps {
  onOpenLegal: () => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onOpenLegal }) => {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('percolo_storage_consent');
    }
    return false;
  });

  const handleAccept = () => {
    localStorage.setItem('percolo_storage_consent', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 text-slate-200 p-4 border-t border-slate-700 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-start gap-3 flex-1">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-white mb-1">Local Processing & Storage</p>
          <p>
            We use local browser storage (IndexedDB) exclusively to cache machine learning models and save your preferences. <strong>We do not use tracking cookies and zero data is sent to external servers.</strong>
            {' '}
            <button
              onClick={onOpenLegal}
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 ml-1"
            >
              Read Legal Notice
            </button>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={handleAccept}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-md transition-colors whitespace-nowrap"
        >
          I Accept
        </button>
        <button
          onClick={() => setIsVisible(false)}
          className="p-2 text-slate-400 hover:text-white rounded-md transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
