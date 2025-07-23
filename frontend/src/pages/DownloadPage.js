import React from 'react';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

const DownloadPage = () => {
  const { t } = useTranslation();

  return (
    <div>
      <Title level={2}>{t('download.title')}</Title>
      <p>Download functionality will be implemented here.</p>
    </div>
  );
};

export default DownloadPage;
