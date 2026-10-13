import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled rendering error:', error, errorInfo);
  }

  public handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public handleResetAll = () => {
    try {
      localStorage.removeItem('printbk-basket-v4');
    } catch (_) {}
    window.location.hash = '#/';
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          background: '#f7f4ee',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: '#ffffff',
            border: '2px solid #0f172a',
            borderRadius: 20,
            padding: '32px 24px',
            maxWidth: 420,
            width: '100%',
            boxShadow: '6px 6px 0 #0f172a',
            boxSizing: 'border-box'
          }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>⚡</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '0 0 8px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px', lineHeight: 1.5 }}>
              A rendering issue occurred. Your files and print job can be easily recovered.
            </p>

            {this.state.error && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 11,
                color: '#dc2626',
                fontFamily: 'monospace',
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 20
              }}>
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={this.handleReload}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Try Again ⟳
              </button>
              <button
                onClick={this.handleResetAll}
                style={{
                  background: 'transparent',
                  color: '#64748b',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 12,
                  padding: '12px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Clear Cache & Start New Job
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
