import { config } from '../config';
import { getOrCreateUserId } from '../utils/identity';

const API_BASE_URL = '/api';

const buildHeaders = (overrides?: Record<string, string>) => ({
  'Content-Type': 'application/json',
  'x-excalidraw-team-id': config.teamId,
  'x-excalidraw-user-id': getOrCreateUserId(),
  ...overrides,
});

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

type RequestBody = unknown;

export const api = {
  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: buildHeaders(),
    });

    if (!response.ok) {
      let message = 'Request failed';
      try {
        const errorData = await response.json();
        message = errorData.message || message;
      } catch {
        message = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(message);
    }

    try {
      const data: ApiResponse<T> = await response.json();
      return (data.data ?? data) as T;
    } catch (error) {
      throw new Error('Failed to parse response as JSON');
    }
  },

  async post<T>(endpoint: string, body?: RequestBody): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let message = 'Request failed';
      try {
        const errorData = await response.json();
        message = errorData.message || message;
      } catch {
        message = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(message);
    }

    try {
      const data: ApiResponse<T> = await response.json();
      return data.data as T;
    } catch (error) {
      throw new Error('Failed to parse response as JSON');
    }
  },

  async put<T>(endpoint: string, body: RequestBody): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let message = 'Request failed';
      try {
        const errorData = await response.json();
        message = errorData.message || message;
      } catch {
        message = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(message);
    }

    try {
      const data: ApiResponse<T> = await response.json();
      return data.data as T;
    } catch (error) {
      throw new Error('Failed to parse response as JSON');
    }
  },

  async delete(endpoint: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    });

    if (!response.ok) {
      let message = 'Request failed';
      try {
        const errorData = await response.json();
        message = errorData.message || message;
      } catch {
        message = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(message);
    }
  },
};
