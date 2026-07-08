// apps/web/src/stores/auth.store.ts

import { create } from 'zustand';
import { api } from '../services/api';

export interface UserWorkspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  workspaces: UserWorkspace[];
}

interface AuthState {
  user: UserProfile | null;
  activeWorkspace: UserWorkspace | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
  logout: () => void;
  switchWorkspace: (workspaceId: string) => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  activeWorkspace: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: () => {
    const storedUser = localStorage.getItem('p2c_user');
    const storedActiveWs = localStorage.getItem('p2c_active_workspace');
    const token = localStorage.getItem('p2c_access_token');

    if (token && storedUser) {
      const userObj = JSON.parse(storedUser);
      const activeWsObj = storedActiveWs ? JSON.parse(storedActiveWs) : userObj.workspaces[0] || null;
      
      if (activeWsObj) {
        localStorage.setItem('p2c_workspace_id', activeWsObj.id);
      }

      set({
        user: userObj,
        activeWorkspace: activeWsObj,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },

  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const response = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: UserProfile;
      }>('/auth/login', credentials);

      localStorage.setItem('p2c_access_token', response.accessToken);
      localStorage.setItem('p2c_refresh_token', response.refreshToken);
      localStorage.setItem('p2c_user', JSON.stringify(response.user));

      const activeWs = response.user.workspaces[0] || null;
      if (activeWs) {
        localStorage.setItem('p2c_workspace_id', activeWs.id);
        localStorage.setItem('p2c_active_workspace', JSON.stringify(activeWs));
      }

      set({
        user: response.user,
        activeWorkspace: activeWs,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (data) => {
    set({ isLoading: true });
    try {
      await api.post<{
        user: any;
        workspace: any;
      }>('/auth/register', data);
      
      // Auto login after registration
      await get().login({ email: data.email, password: data.password });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    const refreshToken = localStorage.getItem('p2c_refresh_token');
    if (refreshToken) {
      api.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
    }

    localStorage.removeItem('p2c_access_token');
    localStorage.removeItem('p2c_refresh_token');
    localStorage.removeItem('p2c_user');
    localStorage.removeItem('p2c_workspace_id');
    localStorage.removeItem('p2c_active_workspace');

    set({
      user: null,
      activeWorkspace: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  switchWorkspace: (workspaceId) => {
    const user = get().user;
    if (!user) return;

    const workspace = user.workspaces.find((ws) => ws.id === workspaceId) || null;
    if (workspace) {
      localStorage.setItem('p2c_workspace_id', workspace.id);
      localStorage.setItem('p2c_active_workspace', JSON.stringify(workspace));
      set({ activeWorkspace: workspace });
      // Force page reload to reconnect socket with new workspace context
      window.location.reload();
    }
  },
}));
