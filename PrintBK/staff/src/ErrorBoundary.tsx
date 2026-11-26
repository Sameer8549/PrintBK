import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
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
    console.error('[Staff ErrorBoundary caught error]:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#0f172a',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'center',
          color: '#ffffff'
        }}>
          <div style={{
            maxWidth: 440,
            width: '100%',
            background: '#1e293b',
            borderRadius: 16,
            border: '1.5px solid #334155',
            padding: '28px 24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛡️</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', margin: '0 0 8px' }}>
              Staff Workbench Interrupted
            </h2>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 20px' }}>
              The application encountered an unexpected interface event. The print queue and background spooler remain active.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                width: '100%',
                padding: '14px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Resume Staff Workbench
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
