"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Game Error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-4">💥</div>
          <h3 className="text-lg font-bold text-red-400 mb-2">Something went wrong</h3>
          <p className="text-gray-400 text-sm mb-4">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based wrapper for functional components
export function GameErrorBoundary({ children, gameName }: { children: ReactNode; gameName: string }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-4">🎰</div>
          <h3 className="text-lg font-bold text-red-400 mb-2">{gameName} Error</h3>
          <p className="text-gray-400 text-sm mb-4">
            Something went wrong loading this game. Please refresh the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition"
          >
            Refresh Page
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
