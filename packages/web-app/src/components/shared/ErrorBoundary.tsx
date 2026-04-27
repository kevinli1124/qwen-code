/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    // Intentionally not logging to console in production to avoid noise;
    // callers can pass onError for custom telemetry.
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#8a8a8a] p-8">
            <div className="text-2xl">⚠</div>
            <div className="text-sm text-center max-w-sm">
              Something went wrong in this section.
              <br />
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="mt-3 px-3 py-1.5 text-xs rounded border border-[#2e2e2e] hover:border-[#555] hover:text-[#e8e6e3] transition-colors"
              >
                Try again
              </button>
            </div>
            {this.state.error && (
              <details className="text-xs text-[#555] max-w-sm">
                <summary className="cursor-pointer">Error details</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        )
      );
    }
    return this.props.children;
  }
}
