import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="error-fallback" role="alert">
          <h2>問題が発生しました</h2>
          <p className="muted">
            予期しないエラーが発生しました。下のボタンで再読み込みしてください。
          </p>
          {this.state.error && (
            <pre className="error-fallback-details" aria-hidden>
              {this.state.error.message}
            </pre>
          )}
          <button type="button" onClick={this.handleRetry} className="btn-primary">
            再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
