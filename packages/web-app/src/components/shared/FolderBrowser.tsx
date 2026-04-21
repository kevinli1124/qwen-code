/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, type FC } from 'react';
import { filesystemApi } from '../../api/filesystem';

interface FolderBrowserProps {
  onSelect: (path: string) => void;
  onFileSelect?: (path: string) => void;
  initialPath?: string;
  mode?: 'folder' | 'file';
}

export const FolderBrowser: FC<FolderBrowserProps> = ({
  onSelect,
  onFileSelect,
  initialPath = '/',
  mode = 'folder',
}) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [dirs, setDirs] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState(initialPath);

  const loadPath = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await filesystemApi.browse(path);
      setDirs(result.dirs);
      setFiles(result.files);
      setCurrentPath(result.path);
      setManualPath(result.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to browse directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPath(initialPath);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = (dir: string) => {
    const newPath =
      currentPath.endsWith('/') || currentPath.endsWith('\\')
        ? `${currentPath}${dir}`
        : `${currentPath}/${dir}`;
    void loadPath(newPath);
  };

  const navigateUp = () => {
    const parts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    const parent =
      parts.length === 1 && currentPath.match(/^[A-Z]:/i)
        ? `${parts[0]}/`
        : `/${parts.join('/')}`;
    void loadPath(parent);
  };

  const pathParts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);

  return (
    <div className="flex flex-col gap-2 flex-1 overflow-hidden">
      {/* Manual path input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadPath(manualPath)}
          placeholder="Type or paste a path..."
          className="flex-1 px-2 py-1.5 text-xs font-mono bg-[#1e1e1e] border border-[#2e2e2e] rounded text-[#e8e6e3] placeholder:text-[#8a8a8a] focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => loadPath(manualPath)}
          className="px-3 py-1.5 text-xs bg-[#2e2e2e] text-[#e8e6e3] rounded hover:bg-[#3e3e3e] transition-colors"
        >
          Go
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-[#8a8a8a] overflow-x-auto">
        <button
          onClick={() => loadPath('/')}
          className="hover:text-accent flex-shrink-0"
        >
          /
        </button>
        {pathParts.map((part, i) => {
          const path = '/' + pathParts.slice(0, i + 1).join('/');
          return (
            <span key={i} className="flex items-center gap-1 flex-shrink-0">
              <span>/</span>
              <button
                onClick={() => loadPath(path)}
                className="hover:text-accent"
              >
                {part}
              </button>
            </span>
          );
        })}
      </div>

      {/* Directory list */}
      <div className="flex-1 overflow-y-auto border border-[#2e2e2e] rounded bg-[#1a1a1a] min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-[#8a8a8a]">
            Loading...
          </div>
        ) : error ? (
          <div className="p-3 text-xs text-red-400">{error}</div>
        ) : (
          <div className="py-1">
            {/* Up button */}
            {pathParts.length > 0 && (
              <button
                onClick={navigateUp}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#8a8a8a] hover:bg-[#2e2e2e] hover:text-[#e8e6e3] transition-colors"
              >
                <span>↑</span>
                <span>..</span>
              </button>
            )}

            {dirs.length === 0 && (
              <div className="px-3 py-2 text-xs text-[#8a8a8a]">
                No subdirectories
              </div>
            )}

            {dirs.map((dir) => (
              <button
                key={`d-${dir}`}
                onClick={() => navigateTo(dir)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#e8e6e3] hover:bg-[#2e2e2e] transition-colors group"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className="text-[#8a8a8a] flex-shrink-0"
                >
                  <path
                    d="M1 3.5A1.5 1.5 0 012.5 2h2.086a1.5 1.5 0 011.06.44l.415.415A1.5 1.5 0 007.12 3.5H9.5A1.5 1.5 0 0111 5v4a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 011 9V3.5z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
                <span className="flex-1 text-left truncate">{dir}</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className="text-[#8a8a8a] group-hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <path
                    d="M3 2l4 3-4 3"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ))}

            {mode === 'file' &&
              files.map((file) => {
                const filePath = `${currentPath.replace(/\\/g, '/').replace(/\/$/, '')}/${file}`;
                return (
                  <button
                    key={`f-${file}`}
                    onClick={() => onFileSelect?.(filePath)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#8a8a8a] hover:bg-[#2e2e2e] hover:text-accent transition-colors"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className="flex-shrink-0"
                    >
                      <path
                        d="M2 1.5A1.5 1.5 0 013.5 0H7l3.5 3.5V10.5A1.5 1.5 0 019 12H3.5A1.5 1.5 0 012 10.5v-9z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M7 0v3.5H10.5"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                    <span className="flex-1 text-left truncate">{file}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Select current button */}
      {mode === 'folder' && (
        <button
          onClick={() => onSelect(currentPath)}
          className="w-full py-2 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors font-medium"
        >
          Select: {currentPath}
        </button>
      )}
    </div>
  );
};
