import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useConfigStore } from '../stores/configStore';
import LoadingSpinner from '../components/common/LoadingSpinner';

const { Title, Text, Link } = Typography;

const LoginPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { login } = useAuthStore();
  const { systemConfig, loadSystemConfig } = useConfigStore();

  // Get the intended destination or default to dashboard
  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    // Load system configuration if not already loaded
    if (!systemConfig) {
      loadSystemConfig();
    }
  }, [systemConfig, loadSystemConfig]);

  const handleSubmit = async (values) => {
    setLoading(true);
    setError('');

    try {
      const result = await login(values);
      
      if (result.success) {
        // Redirect to intended destination
        navigate(from, { replace: true });
      } else {
        setError(result.error || t('auth.loginError'));
      }
    } catch (err) {
      setError(t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  if (!systemConfig) {
    return <LoadingSpinner size="large" />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
      padding: '20px'
    }}>
      <Card
        style={{
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}
        bodyStyle={{ padding: '40px' }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          {systemConfig.logoUrl ? (
            <img 
              src={systemConfig.logoUrl} 
              alt={systemConfig.name}
              style={{ 
                height: '48px',
                marginBottom: '16px'
              }}
            />
          ) : (
            <Title level={2} style={{ margin: '0 0 16px 0', fontWeight: 300 }}>
              {systemConfig.name}
            </Title>
          )}
          
          <Title level={3} style={{ margin: '0 0 8px 0', fontWeight: 400 }}>
            {t('auth.pleaseLogin')}
          </Title>
          
          <Text type="secondary">
            {t('auth.welcomeBack')}
          </Text>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            style={{ marginBottom: '24px' }}
            closable
            onClose={() => setError('')}
          />
        )}

        {/* Login Form */}
        <Form
          form={form}
          name="login"
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
          autoComplete="off"
        >
          <Form.Item
            name="username"
            label={t('auth.username')}
            rules={[
              {
                required: true,
                message: `${t('auth.username')} ist erforderlich`
              }
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder={t('auth.username')}
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('auth.password')}
            rules={[
              {
                required: true,
                message: `${t('auth.password')} ist erforderlich`
              }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t('auth.password')}
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: '16px' }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              {loading ? t('common.loading') : t('auth.loginButton')}
            </Button>
          </Form.Item>
        </Form>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Space direction="vertical" size="small">
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Anmeldung über LDAP/Active Directory
            </Text>
            
            {systemConfig.features?.helpUrl && (
              <Link href={systemConfig.features.helpUrl} target="_blank">
                {t('nav.help')}
              </Link>
            )}
            
            <Link href="/privacy" target="_blank">
              {t('privacy.title')}
            </Link>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
