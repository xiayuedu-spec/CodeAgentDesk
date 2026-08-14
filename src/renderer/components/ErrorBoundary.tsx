import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

/** 渲染层兜底：组件树抛出异常时展示错误页而不是白屏。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('渲染层异常:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <div className="error-boundary-title">界面出错了</div>
            <pre className="error-boundary-message">{this.state.error.message}</pre>
            <button type="button" className="welcome-btn primary" onClick={this.handleReload}>
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
