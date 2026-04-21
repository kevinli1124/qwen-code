/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export const ErrorBanner: FC<ErrorBannerProps> = ({ message, onDismiss }) => (
  <div className="flex items-center gap-3 px-4 py-2 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300">
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="flex-shrink-0"
    >
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M7 4v4M7 9.5v.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
    <span className="flex-1">{message}</span>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="hover:text-white transition-colors"
      >
        ✕
      </button>
    )}
  </div>
);
