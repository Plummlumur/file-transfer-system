import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../utils/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      // Actions
      login: async (credentials) => {
        set({ loading: true, error: null });
        
        try {
          const response = await api.post('/auth/login', credentials);
          const { token, user } = response.data;
          
          // Set token in API headers
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          set({
            user,
            token,
            isAuthenticated: true,
            loading: false,
            error: null
          });
          
          return { success: true };
        } catch (error) {
          const errorMessage = error.response?.data?.error || 'Login failed';
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            loading: false,
            error: errorMessage
          });
          
          return { success: false, error: errorMessage };
        }
      },

      logout: async () => {
        set({ loading: true });
        
        try {
          // Call logout endpoint if authenticated
          if (get().isAuthenticated) {
            await api.post('/auth/logout');
          }
        } catch (error) {
          console.warn('Logout API call failed:', error);
        } finally {
          // Clear auth data regardless of API call result
          delete api.defaults.headers.common['Authorization'];
          
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            loading: false,
            error: null
          });
        }
      },

      checkAuth: async () => {
        const { token } = get();
        
        if (!token) {
          set({ loading: false });
          return;
        }
        
        set({ loading: true });
        
        try {
          // Set token in API headers
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          // Verify token with server
          const response = await api.get('/auth/profile');
          const user = response.data.user;
          
          set({
            user,
            isAuthenticated: true,
            loading: false,
            error: null
          });
        } catch (error) {
          console.warn('Token verification failed:', error);
          
          // Clear invalid auth data
          delete api.defaults.headers.common['Authorization'];
          
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            loading: false,
            error: null
          });
        }
      },

      refreshToken: async () => {
        const { token } = get();
        
        if (!token) {
          return { success: false, error: 'No token available' };
        }
        
        try {
          const response = await api.post('/auth/refresh');
          const { token: newToken } = response.data;
          
          // Update token in store and API headers
          api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
          
          set({ token: newToken });
          
          return { success: true };
        } catch (error) {
          console.warn('Token refresh failed:', error);
          
          // Force logout on refresh failure
          get().logout();
          
          return { success: false, error: 'Token refresh failed' };
        }
      },

      updateProfile: async (profileData) => {
        set({ loading: true, error: null });
        
        try {
          const response = await api.put('/auth/profile', profileData);
          const { user } = response.data;
          
          set({
            user,
            loading: false,
            error: null
          });
          
          return { success: true };
        } catch (error) {
          const errorMessage = error.response?.data?.error || 'Profile update failed';
          set({
            loading: false,
            error: errorMessage
          });
          
          return { success: false, error: errorMessage };
        }
      },

      getUserActivity: async (params = {}) => {
        try {
          const response = await api.get('/auth/activity', { params });
          return { success: true, data: response.data };
        } catch (error) {
          const errorMessage = error.response?.data?.error || 'Failed to fetch activity';
          return { success: false, error: errorMessage };
        }
      },

      clearError: () => {
        set({ error: null });
      },

      // Computed getters
      isAdmin: () => {
        const { user } = get();
        return user?.is_admin || false;
      },

      getQuotaStatus: () => {
        const { user } = get();
        return user?.quota_status || null;
      },

      canUpload: (fileSize = 0) => {
        const { user } = get();
        if (!user?.quota_status) return true;
        
        const { daily, monthly } = user.quota_status;
        return (
          daily.used + fileSize <= daily.total &&
          monthly.used + fileSize <= monthly.total
        );
      },

      getUploadLimits: () => {
        const { user } = get();
        if (!user?.quota_status) return null;
        
        return {
          daily: {
            remaining: user.quota_status.daily.total - user.quota_status.daily.used,
            percentage: user.quota_status.daily.percentage
          },
          monthly: {
            remaining: user.quota_status.monthly.total - user.quota_status.monthly.used,
            percentage: user.quota_status.monthly.percentage
          }
        };
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      }),
      onRehydrateStorage: () => (state) => {
        // Set up API headers when rehydrating from storage
        if (state?.token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
        }
      }
    }
  )
);

// Set up API interceptors for token management
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const { refreshToken, logout } = useAuthStore.getState();
      
      // Try to refresh token
      const refreshResult = await refreshToken();
      
      if (refreshResult.success) {
        // Retry original request with new token
        const { token } = useAuthStore.getState();
        originalRequest.headers['Authorization'] = `Bearer ${token}`;
        return api(originalRequest);
      } else {
        // Refresh failed, logout user
        logout();
      }
    }
    
    return Promise.reject(error);
  }
);

export { useAuthStore };
