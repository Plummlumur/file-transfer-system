import React from 'react';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

const FilesPage = () => {
  const { t } = useTranslation();

  return (
    <div>
      <Title level={2}>{t('files.title')}</Title>
      <p>File management functionality will be implemented here.</p>
    </div>
  );
};

export default FilesPage;
