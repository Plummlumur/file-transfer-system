import { create } from 'zustand';
import api from '../utils/api';

const useConfigStore = create((set, get) => ({
  // State
  systemConfig: null,
  capabilities: null,
  fileTypes: null,
  loading: false,
  error: null,

  // Actions
  loadSystemConfig: async () => {
    set({ loading: true, error: null });
    
    try {
      const [infoResponse, capabilitiesResponse, fileTypesResponse] = await Promise.all([
        api.get('/system/info'),
        api.get('/system/capabilities'),
        api.get('/system/file-types')
      ]);
      
      set({
        systemConfig: infoResponse.data,
        capabilities: capabilitiesResponse.data,
        fileTypes: fileTypesResponse.data,
        loading: false,
        error: null
      });
      
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to load system configuration';
      set({
        loading: false,
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  },

  getMaxFileSize: () => {
    const { systemConfig } = get();
    return systemConfig?.maxFileSize || 5368709120; // 5GB default
  },

  getFormattedMaxFileSize: () => {
    const { capabilities } = get();
    return capabilities?.upload?.formattedMaxSize || '5 GB';
  },

  getAllowedExtensions: () => {
    const { systemConfig } = get();
    return systemConfig?.allowedExtensions || [];
  },

  isFileTypeAllowed: (filename) => {
    const allowedExtensions = get().getAllowedExtensions();
    if (allowedExtensions.length === 0) return false;
    
    const extension = filename.split('.').pop()?.toLowerCase();
    return allowedExtensions.includes(extension);
  },

  getFileTypeInfo: (extension) => {
    const { fileTypes } = get();
    if (!fileTypes?.supportedTypes) return null;
    
    return fileTypes.supportedTypes.find(type => type.extension === extension.toLowerCase());
  },

  getUploadCapabilities: () => {
    const { capabilities } = get();
    return capabilities?.upload || {};
  },

  getDownloadCapabilities: () => {
    const { capabilities } = get();
    return capabilities?.download || {};
  },

  getRetentionSettings: () => {
    const { capabilities } = get();
    return capabilities?.retention || {};
  },

  getSecurityFeatures: () => {
    const { capabilities } = get();
    return capabilities?.security || {};
  },

  isMaintenanceMode: () => {
    const { systemConfig } = get();
    return systemConfig?.maintenanceMode || false;
  },

  getSystemName: () => {
    const { systemConfig } = get();
    return systemConfig?.name || 'File Transfer System';
  },

  getLogoUrl: () => {
    const { systemConfig } = get();
    return systemConfig?.logoUrl;
  },

  getSessionTimeout: () => {
    const { systemConfig } = get();
    return systemConfig?.sessionTimeout || 480; // 8 hours default
  },

  hasFeature: (featureName) => {
    const { systemConfig } = get();
    return systemConfig?.features?.[featureName] || false;
  },

  clearError: () => {
    set({ error: null });
  }
}));

export { useConfigStore };
