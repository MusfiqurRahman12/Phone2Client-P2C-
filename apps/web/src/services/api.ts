// apps/web/src/services/api.ts

interface RequestOptions extends RequestInit {
  body?: any;
}

class ApiService {
  private getAccessToken(): string | null {
    return localStorage.getItem('p2c_access_token');
  }

  private getWorkspaceId(): string | null {
    return localStorage.getItem('p2c_workspace_id');
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    
    // Set content type to JSON by default
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    // Set authorization header
    const token = this.getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // Set active tenant workspace header
    const workspaceId = this.getWorkspaceId();
    if (workspaceId) {
      headers.set('X-Workspace-Id', workspaceId);
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    if (options.body && !(options.body instanceof FormData)) {
      config.body = JSON.stringify(options.body);
    }

    const baseUrl = import.meta.env.VITE_API_URL || '/api/v1';
    const response = await fetch(`${baseUrl}${path}`, config);

    if (response.status === 204) {
      return {} as T;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }

    return data;
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: any, options?: RequestOptions) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T>(path: string, body?: any, options?: RequestOptions) {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiService();
