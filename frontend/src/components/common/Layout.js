import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Avatar, Dropdown, Typography, Space, Badge } from 'antd';
import {
  DashboardOutlined,
  UploadOutlined,
  FileOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useConfigStore } from '../../stores/configStore';

const { Header, Sider, Content } = AntLayout;
const { Title, Text } = Typography;

const Layout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { systemConfig } = useConfigStore();

  // Get current path for menu selection
  const currentPath = location.pathname;
  const selectedKeys = [currentPath.split('/')[1] || 'dashboard'];

  // Menu items
  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: t('nav.dashboard'),
      onClick: () => navigate('/dashboard')
    },
    {
      key: 'upload',
      icon: <UploadOutlined />,
      label: t('nav.upload'),
      onClick: () => navigate('/upload')
    },
    {
      key: 'files',
      icon: <FileOutlined />,
      label: t('nav.files'),
      onClick: () => navigate('/files')
    }
  ];

  // Add admin menu item if user is admin
  if (user?.is_admin) {
    menuItems.push({
      key: 'admin',
      icon: <SettingOutlined />,
      label: t('nav.admin'),
      onClick: () => navigate('/admin')
    });
  }

  // User dropdown menu
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: t('nav.profile'),
      onClick: () => navigate('/profile')
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('nav.settings'),
      onClick: () => navigate('/settings')
    },
    {
      type: 'divider'
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('nav.logout'),
      onClick: handleLogout
    }
  ];

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        width={240}
        style={{
          background: '#ffffff',
          borderRight: '1px solid #d9d9d9'
        }}
      >
        {/* Logo/Brand */}
        <div style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 24px',
          borderBottom: '1px solid #d9d9d9'
        }}>
          {systemConfig?.logoUrl ? (
            <img 
              src={systemConfig.logoUrl} 
              alt={systemConfig.name}
              style={{ 
                height: '32px',
                maxWidth: collapsed ? '32px' : '160px'
              }}
            />
          ) : (
            <Title 
              level={4} 
              style={{ 
                margin: 0, 
                color: '#000000',
                fontSize: collapsed ? '16px' : '18px',
                fontWeight: 300
              }}
            >
              {collapsed ? 'FT' : (systemConfig?.name || 'File Transfer')}
            </Title>
          )}
        </div>

        {/* Navigation Menu */}
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          items={menuItems}
          style={{
            border: 'none',
            marginTop: '16px'
          }}
        />
      </Sider>

      <AntLayout>
        <Header style={{
          background: '#ffffff',
          padding: '0 24px',
          borderBottom: '1px solid #d9d9d9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Left side - Collapse trigger */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              onClick={toggleCollapsed}
              style={{
                fontSize: '16px',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '4px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </div>
          </div>

          {/* Right side - User info and actions */}
          <Space size="middle">
            {/* Notifications */}
            <Badge count={0} size="small">
              <BellOutlined 
                style={{ 
                  fontSize: '16px', 
                  cursor: 'pointer',
                  padding: '8px'
                }} 
              />
            </Badge>

            {/* User dropdown */}
            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              trigger={['click']}
            >
              <div style={{ 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                borderRadius: '4px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <Space>
                  <Avatar 
                    size="small" 
                    icon={<UserOutlined />}
                    style={{ backgroundColor: '#000000' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <Text strong style={{ fontSize: '14px', lineHeight: 1.2 }}>
                      {user?.display_name || user?.username}
                    </Text>
                    {user?.is_admin && (
                      <Text type="secondary" style={{ fontSize: '12px', lineHeight: 1.2 }}>
                        Administrator
                      </Text>
                    )}
                  </div>
                </Space>
              </div>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{
          margin: '24px',
          padding: '24px',
          background: '#ffffff',
          borderRadius: '2px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'auto'
        }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
