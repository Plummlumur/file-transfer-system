import React from 'react';
import { Navigate } from 'react-router-dom';
import { Result, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';

const AdminRoute = ({ children }) => {
  const { user, isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.is_admin) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '20px'
      }}>
        <Result
          status="403"
          title="403"
          subTitle={t('auth.forbidden')}
          extra={
            <Button type="primary" onClick={() => window.history.back()}>
              {t('common.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return children;
};

export default AdminRoute;
