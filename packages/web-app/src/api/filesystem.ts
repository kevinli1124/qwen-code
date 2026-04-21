import { apiFetch } from './client';

export interface BrowseResult {
  path: string;
  dirs: string[];
  files: string[];
}

export const filesystemApi = {
  browse: (path: string) =>
    apiFetch<BrowseResult>(`/api/browse?path=${encodeURIComponent(path)}`),
  readFile: (path: string) =>
    apiFetch<{ content: string; size: number }>(
      `/api/read-file?path=${encodeURIComponent(path)}`,
    ),
};
