import React from 'react';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

const AdminPage = () => {
  const { t } = useTranslation();

  return (
    <div>
      <Title level={2}>{t('admin.title')}</Title>
      <p>Admin functionality will be implemented here.</p>
    </div>
  );
};

export default AdminPage;
