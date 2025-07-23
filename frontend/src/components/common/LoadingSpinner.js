import React from 'react';
import { Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

const LoadingSpinner = ({ 
  size = 'default', 
  tip = '', 
  spinning = true, 
  children,
  style = {},
  className = ''
}) => {
  const antIcon = <LoadingOutlined style={{ fontSize: size === 'large' ? 24 : 14 }} spin />;

  if (children) {
    return (
      <Spin 
        spinning={spinning} 
        tip={tip} 
        indicator={antIcon}
        size={size}
        style={style}
        className={className}
      >
        {children}
      </Spin>
    );
  }

  return (
    <div 
      className={`loading-spinner-container ${className}`}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px',
        ...style
      }}
    >
      <Spin 
        indicator={antIcon} 
        tip={tip} 
        size={size}
      />
    </div>
  );
};

export default LoadingSpinner;
