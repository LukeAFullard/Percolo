import React from 'react';
import { X, ShieldCheck } from 'lucide-react';

interface LegalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Legal Notice & Privacy Policy
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-sm text-slate-600 dark:text-slate-300">
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">1. Privacy First: Zero-Server Architecture</h3>
            <p>
              This application is designed from the ground up for maximum privacy. It utilizes a zero-server architecture, meaning <strong>all data processing occurs locally within your web browser</strong>.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Documents uploaded are never transmitted to any external server.</li>
              <li>High-dimensional vector math and Natural Language Processing (NLP) are executed on your device using WebAssembly and WebGPU.</li>
              <li>The developers of this application have no access to the files you process, the topics generated, or any metadata.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">2. Local Storage & Cookies</h3>
            <p>
              To provide a seamless experience, this application uses standard browser storage mechanisms (such as IndexedDB and LocalStorage) to:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Cache machine learning models (e.g., ONNX files) locally so they do not need to be re-downloaded, saving bandwidth and improving startup times.</li>
              <li>Store user preferences (such as selected settings and UI configurations).</li>
            </ul>
            <p className="mt-2">
              We do not use tracking cookies, analytics pixels, or any third-party tracking mechanisms.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">3. Limitation of Liability</h3>
            <p>
              This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.
            </p>
            <p className="mt-2">
              In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software. You are solely responsible for ensuring you have the legal right to process the documents you upload.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">4. Third-Party Models</h3>
            <p>
              This application utilizes open-source machine learning models downloaded dynamically from Hugging Face. While the execution is local, the models themselves are subject to their respective open-source licenses.
            </p>
          </section>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
