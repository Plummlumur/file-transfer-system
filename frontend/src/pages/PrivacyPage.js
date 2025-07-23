import React from 'react';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

const PrivacyPage = () => {
  const { t } = useTranslation();

  return (
    <div>
      <Title level={2}>{t('privacy.title')}</Title>
      <p>Privacy policy content will be implemented here.</p>
    </div>
  );
};

export default PrivacyPage;
