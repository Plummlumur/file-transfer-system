import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { useTranslation } from 'react-i18next';
import deDE from 'antd/locale/de_DE';
import enUS from 'antd/locale/en_US';

// Store imports
import { useAuthStore } from './stores/authStore';
import { useConfigStore } from './stores/configStore';

// Component imports
import Layout from './components/common/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import FilesPage from './pages/FilesPage';
import AdminPage from './pages/AdminPage';
import DownloadPage from './pages/DownloadPage';
import PrivacyPage from './pages/PrivacyPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import ErrorBoundary from './components/common/ErrorBoundary';

// Route protection components
import ProtectedRoute from './components/common/ProtectedRoute';
import AdminRoute from './components/common/AdminRoute';

// Styles
import './App.css';
import './i18n';

// Theme configuration inspired by mumok.at
const theme = {
  token: {
    colorPrimary: '#000000',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#1890ff',
    borderRadius: 2,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorText: '#000000',
    colorTextSecondary: '#666666',
    colorBorder: '#d9d9d9',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    controlHeight: 40,
    wireframe: false
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 64,
      siderBg: '#ffffff',
      bodyBg: '#f5f5f5'
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: '#f0f0f0',
      itemHoverBg: '#f5f5f5',
      itemColor: '#000000',
      itemSelectedColor: '#000000'
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none'
    },
    Card: {
      headerBg: '#ffffff',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    },
    Table: {
      headerBg: '#fafafa',
      rowHoverBg: '#f5f5f5'
    },
    Upload: {
      colorPrimary: '#000000'
    }
  }
};

function App() {
  const { i18n } = useTranslation();
  const { user, isAuthenticated, loading, checkAuth } = useAuthStore();
  const { systemConfig, loadSystemConfig } = useConfigStore();

  // Get Ant Design locale based on current language
  const getAntdLocale = () => {
    return i18n.language === 'de' ? deDE : enUS;
  };

  useEffect(() => {
    // Load system configuration
    loadSystemConfig();
    
    // Check authentication status
    checkAuth();
  }, [loadSystemConfig, checkAuth]);

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="app-loading">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Show maintenance mode if enabled
  if (systemConfig?.maintenanceMode && !user?.is_admin) {
    return (
      <div className="maintenance-mode">
        <div className="maintenance-content">
          <h1>System Wartung</h1>
          <p>Das System befindet sich derzeit im Wartungsmodus. Bitte versuchen Sie es später erneut.</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ConfigProvider 
        theme={theme} 
        locale={getAntdLocale()}
      >
        <AntApp>
          <Router>
            <div className="App">
              <Routes>
                {/* Public routes */}
                <Route 
                  path="/login" 
                  element={
                    isAuthenticated ? 
                      <Navigate to="/dashboard" replace /> : 
                      <LoginPage />
                  } 
                />
                <Route 
                  path="/download/:token" 
                  element={<DownloadPage />} 
                />
                <Route 
                  path="/privacy" 
                  element={<PrivacyPage />} 
                />

                {/* Protected routes */}
                <Route 
                  path="/" 
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="upload" element={<UploadPage />} />
                  <Route path="files" element={<FilesPage />} />
                  
                  {/* Admin routes */}
                  <Route 
                    path="admin/*" 
                    element={
                      <AdminRoute>
                        <AdminPage />
                      </AdminRoute>
                    } 
                  />
                </Route>

                {/* Fallback route */}
                <Route 
                  path="*" 
                  element={
                    isAuthenticated ? 
                      <Navigate to="/dashboard" replace /> : 
                      <Navigate to="/login" replace />
                  } 
                />
              </Routes>
            </div>
          </Router>
        </AntApp>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
