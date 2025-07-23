import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Space, Progress, Button, List, Tag } from 'antd';
import { 
  FileOutlined, 
  UploadOutlined, 
  DownloadOutlined, 
  ClockCircleOutlined,
  PlusOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFileStore } from '../stores/fileStore';
import LoadingSpinner from '../components/common/LoadingSpinner';
import api from '../utils/api';

const { Title, Text } = Typography;

const DashboardPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { files, loadFiles } = useFileStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load user's files
      await loadFiles({ limit: 5, sort: 'date', order: 'desc' });
      
      // Load basic stats (you could create a dedicated endpoint for this)
      const statsData = {
        totalFiles: files.length,
        activeFiles: files.filter(f => f.status === 'ready').length,
        totalSize: files.reduce((sum, f) => sum + (f.file_size || 0), 0),
        recentFiles: files.slice(0, 5)
      };
      
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status) => {
    const colors = {
      ready: 'green',
      uploading: 'blue',
      expired: 'red',
      deleted: 'default'
    };
    return colors[status] || 'default';
  };

  const getStatusText = (status) => {
    const texts = {
      ready: t('files.ready'),
      uploading: t('files.uploading'),
      expired: t('files.expired'),
      deleted: t('files.deleted')
    };
    return texts[status] || status;
  };

  if (loading) {
    return <LoadingSpinner size="large" />;
  }

  const quotaStatus = user?.quota_status;

  return (
    <div>
      {/* Welcome Header */}
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>
          {t('dashboard.welcome')}, {user?.display_name || user?.username}!
        </Title>
        <Text type="secondary">
          Hier ist eine Übersicht Ihrer Datei-Aktivitäten
        </Text>
      </div>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('dashboard.totalFiles')}
              value={stats?.totalFiles || 0}
              prefix={<FileOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('dashboard.activeFiles')}
              value={stats?.activeFiles || 0}
              prefix={<UploadOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('dashboard.totalSize')}
              value={formatBytes(stats?.totalSize || 0)}
              prefix={<DownloadOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Aktive Downloads"
              value={0}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Quota Usage */}
        {quotaStatus && (
          <Col xs={24} lg={12}>
            <Card title={t('dashboard.quotaUsage')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>{t('dashboard.dailyQuota')}</Text>
                  <Progress
                    percent={quotaStatus.daily.percentage}
                    status={quotaStatus.daily.percentage > 90 ? 'exception' : 'normal'}
                    format={() => `${formatBytes(quotaStatus.daily.used)} / ${formatBytes(quotaStatus.daily.total)}`}
                  />
                </div>
                <div>
                  <Text strong>{t('dashboard.monthlyQuota')}</Text>
                  <Progress
                    percent={quotaStatus.monthly.percentage}
                    status={quotaStatus.monthly.percentage > 90 ? 'exception' : 'normal'}
                    format={() => `${formatBytes(quotaStatus.monthly.used)} / ${formatBytes(quotaStatus.monthly.total)}`}
                  />
                </div>
              </Space>
            </Card>
          </Col>
        )}

        {/* Quick Actions */}
        <Col xs={24} lg={quotaStatus ? 12 : 24}>
          <Card title={t('dashboard.quickActions')}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="large"
                block
                onClick={() => navigate('/upload')}
              >
                {t('dashboard.uploadFiles')}
              </Button>
              <Button
                icon={<EyeOutlined />}
                size="large"
                block
                onClick={() => navigate('/files')}
              >
                {t('dashboard.viewFiles')}
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Recent Files */}
      {stats?.recentFiles && stats.recentFiles.length > 0 && (
        <Card 
          title={t('dashboard.recentFiles')} 
          style={{ marginTop: '16px' }}
          extra={
            <Button type="link" onClick={() => navigate('/files')}>
              Alle anzeigen
            </Button>
          }
        >
          <List
            dataSource={stats.recentFiles}
            renderItem={(file) => (
              <List.Item
                actions={[
                  <Tag color={getStatusColor(file.status)}>
                    {getStatusText(file.status)}
                  </Tag>
                ]}
              >
                <List.Item.Meta
                  avatar={<FileOutlined style={{ fontSize: '16px' }} />}
                  title={file.original_filename}
                  description={
                    <Space>
                      <Text type="secondary">{formatBytes(file.file_size)}</Text>
                      <Text type="secondary">•</Text>
                      <Text type="secondary">
                        {new Date(file.upload_date).toLocaleDateString('de-DE')}
                      </Text>
                      {file.recipients && (
                        <>
                          <Text type="secondary">•</Text>
                          <Text type="secondary">
                            {file.recipients.length} Empfänger
                          </Text>
                        </>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;
