import React from 'react';
import { Result, Button } from 'antd';
import { useTranslation } from 'react-i18next';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // You can also log the error to an error reporting service here
    if (process.env.NODE_ENV === 'production') {
      // Log to error reporting service
      // Example: Sentry.captureException(error);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback 
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReload={this.handleReload}
          onGoHome={this.handleGoHome}
        />
      );
    }

    return this.props.children;
  }
}

const ErrorFallback = ({ error, errorInfo, onReload, onGoHome }) => {
  const { t } = useTranslation();

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px'
    }}>
      <Result
        status="500"
        title="500"
        subTitle={t('error.generic')}
        extra={
          <div style={{ textAlign: 'center' }}>
            <Button type="primary" onClick={onReload} style={{ marginRight: '8px' }}>
              {t('common.refresh')}
            </Button>
            <Button onClick={onGoHome}>
              {t('common.back')}
            </Button>
          </div>
        }
      >
        {process.env.NODE_ENV === 'development' && error && (
          <div style={{ 
            textAlign: 'left', 
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            border: '1px solid #d9d9d9'
          }}>
            <h4>Error Details (Development Mode):</h4>
            <pre style={{ 
              fontSize: '12px', 
              overflow: 'auto',
              maxHeight: '200px',
              margin: 0
            }}>
              {error.toString()}
              {errorInfo && errorInfo.componentStack}
            </pre>
          </div>
        )}
      </Result>
    </div>
  );
};

export default ErrorBoundary;
