/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, type FC } from 'react';
import { FolderBrowser } from '../shared/FolderBrowser';

interface NewSessionModalProps {
  onConfirm: (cwd: string, title?: string) => void;
  onClose: () => void;
}

export const NewSessionModal: FC<NewSessionModalProps> = ({
  onConfirm,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [step, setStep] = useState<'folder' | 'title'>('folder');

  const handleFolderSelect = (path: string) => {
    setSelectedPath(path);
    setStep('title');
  };

  const handleConfirm = () => {
    if (!selectedPath) return;
    onConfirm(selectedPath, title || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-[#2e2e2e] rounded-lg w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e2e2e]">
          <h2 className="text-sm font-semibold text-[#e8e6e3]">New Session</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded hover:bg-[#2e2e2e] flex items-center justify-center text-[#8a8a8a] hover:text-[#e8e6e3]"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
          {step === 'folder' ? (
            <>
              <p className="text-xs text-[#8a8a8a]">
                Select the project folder. This is equivalent to running{' '}
                <code className="bg-[#1e1e1e] px-1 rounded text-accent">
                  qwen
                </code>{' '}
                in that directory.
              </p>
              <FolderBrowser onSelect={handleFolderSelect} />
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-xs text-[#8a8a8a] bg-[#1e1e1e] px-3 py-2 rounded">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1 3h10v7a1 1 0 01-1 1H2a1 1 0 01-1-1V3zM4 3V2a1 1 0 011-1h2a1 1 0 011 1v1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
                <span className="truncate font-mono">{selectedPath}</span>
                <button
                  onClick={() => setStep('folder')}
                  className="ml-auto text-accent hover:underline flex-shrink-0"
                >
                  Change
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#8a8a8a]">
                  Session title (optional)
                </label>
                <input
                  type="text"
                  placeholder={`Working in ${selectedPath.split('/').pop() ?? selectedPath}...`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                  autoFocus
                  className="px-3 py-2 text-sm bg-[#1e1e1e] border border-[#2e2e2e] rounded text-[#e8e6e3] placeholder:text-[#8a8a8a] focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'title' && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#2e2e2e]">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[#8a8a8a] hover:text-[#e8e6e3] rounded hover:bg-[#2e2e2e] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedPath}
              className="px-4 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Session
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
