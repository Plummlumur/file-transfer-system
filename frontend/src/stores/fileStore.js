import { create } from 'zustand';
import api from '../utils/api';

const useFileStore = create((set, get) => ({
  // State
  files: [],
  currentFile: null,
  uploadProgress: {},
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
    hasNext: false,
    hasPrev: false
  },
  filters: {
    search: '',
    status: '',
    sort: 'date',
    order: 'desc'
  },

  // Actions
  loadFiles: async (params = {}) => {
    set({ loading: true, error: null });
    
    try {
      const queryParams = {
        ...get().filters,
        ...params
      };
      
      const response = await api.get('/files', { params: queryParams });
      const { files, pagination } = response.data;
      
      set({
        files,
        pagination,
        loading: false,
        error: null
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to load files';
      set({
        loading: false,
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  },

  loadFile: async (fileId) => {
    set({ loading: true, error: null });
    
    try {
      const response = await api.get(`/files/${fileId}`);
      const file = response.data;
      
      set({
        currentFile: file,
        loading: false,
        error: null
      });
      
      return { success: true, data: file };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to load file';
      set({
        loading: false,
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  },

  uploadFile: async (fileData, onProgress) => {
    const fileId = Date.now().toString();
    
    set(state => ({
      uploadProgress: {
        ...state.uploadProgress,
        [fileId]: { progress: 0, status: 'uploading' }
      }
    }));
    
    try {
      const formData = new FormData();
      formData.append('file', fileData.file);
      formData.append('recipients', JSON.stringify(fileData.recipients));
      
      if (fileData.description) {
        formData.append('description', fileData.description);
      }
      if (fileData.retention_days) {
        formData.append('retention_days', fileData.retention_days);
      }
      if (fileData.max_downloads) {
        formData.append('max_downloads', fileData.max_downloads);
      }
      if (fileData.custom_message) {
        formData.append('custom_message', fileData.custom_message);
      }
      
      const response = await api.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          
          set(state => ({
            uploadProgress: {
              ...state.uploadProgress,
              [fileId]: { progress, status: 'uploading' }
            }
          }));
          
          if (onProgress) {
            onProgress(progress);
          }
        }
      });
      
      const uploadedFile = response.data.file;
      
      // Update progress to completed
      set(state => ({
        uploadProgress: {
          ...state.uploadProgress,
          [fileId]: { progress: 100, status: 'completed' }
        },
        files: [uploadedFile, ...state.files]
      }));
      
      // Clean up progress after delay
      setTimeout(() => {
        set(state => {
          const newProgress = { ...state.uploadProgress };
          delete newProgress[fileId];
          return { uploadProgress: newProgress };
        });
      }, 3000);
      
      return { success: true, data: uploadedFile };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Upload failed';
      
      set(state => ({
        uploadProgress: {
          ...state.uploadProgress,
          [fileId]: { progress: 0, status: 'error', error: errorMessage }
        }
      }));
      
      return { success: false, error: errorMessage };
    }
  },

  uploadMultipleFiles: async (filesData, onProgress) => {
    try {
      const formData = new FormData();
      
      filesData.files.forEach(file => {
        formData.append('files', file);
      });
      
      formData.append('recipients', JSON.stringify(filesData.recipients));
      
      if (filesData.description) {
        formData.append('description', filesData.description);
      }
      if (filesData.retention_days) {
        formData.append('retention_days', filesData.retention_days);
      }
      
      const response = await api.post('/files/upload-multiple', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          
          if (onProgress) {
            onProgress(progress);
          }
        }
      });
      
      const uploadedFiles = response.data.files;
      
      // Add uploaded files to the beginning of the list
      set(state => ({
        files: [...uploadedFiles, ...state.files]
      }));
      
      return { success: true, data: uploadedFiles };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Bulk upload failed';
      return { success: false, error: errorMessage };
    }
  },

  deleteFile: async (fileId) => {
    set({ loading: true, error: null });
    
    try {
      await api.delete(`/files/${fileId}`);
      
      // Remove file from local state
      set(state => ({
        files: state.files.filter(file => file.id !== fileId),
        loading: false,
        error: null
      }));
      
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to delete file';
      set({
        loading: false,
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  },

  downloadFile: async (fileId, filename) => {
    try {
      const response = await api.get(`/files/${fileId}/download`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Download failed';
      return { success: false, error: errorMessage };
    }
  },

  resendEmails: async (fileId, recipients = []) => {
    try {
      const payload = recipients.length > 0 ? { recipients } : {};
      const response = await api.post(`/files/${fileId}/resend-emails`, payload);
      
      return { success: true, data: response.data };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to resend emails';
      return { success: false, error: errorMessage };
    }
  },

  updateFilters: (newFilters) => {
    set(state => ({
      filters: {
        ...state.filters,
        ...newFilters
      }
    }));
  },

  clearFilters: () => {
    set({
      filters: {
        search: '',
        status: '',
        sort: 'date',
        order: 'desc'
      }
    });
  },

  setCurrentFile: (file) => {
    set({ currentFile: file });
  },

  clearCurrentFile: () => {
    set({ currentFile: null });
  },

  clearError: () => {
    set({ error: null });
  },

  // Computed getters
  getFileById: (fileId) => {
    const { files } = get();
    return files.find(file => file.id === fileId);
  },

  getFilesByStatus: (status) => {
    const { files } = get();
    return files.filter(file => file.status === status);
  },

  getTotalFileSize: () => {
    const { files } = get();
    return files.reduce((total, file) => total + (file.file_size || 0), 0);
  },

  getUploadProgressById: (fileId) => {
    const { uploadProgress } = get();
    return uploadProgress[fileId] || null;
  },

  hasActiveUploads: () => {
    const { uploadProgress } = get();
    return Object.values(uploadProgress).some(
      progress => progress.status === 'uploading'
    );
  },

  getActiveUploadsCount: () => {
    const { uploadProgress } = get();
    return Object.values(uploadProgress).filter(
      progress => progress.status === 'uploading'
    ).length;
  }
}));

export { useFileStore };
