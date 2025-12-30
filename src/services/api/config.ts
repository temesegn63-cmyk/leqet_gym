import axios from 'axios';

// Create axios instance with base URL from environment variables
const rawApiBase = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const apiBaseUrl = rawApiBase.endsWith('/api') ? rawApiBase : `${rawApiBase}/api`;

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

function getCookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const parts = document.cookie ? document.cookie.split(';') : [];
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}

// Add a request interceptor to include CSRF token if available
api.interceptors.request.use(
  (config) => {
    const csrfToken = getCookieValue('leqet_csrf');
    if (csrfToken) {
      config.headers = config.headers || {};
      config.headers['x-csrf-token'] = csrfToken;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('leqet_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API Configuration
const API_CONFIG = {
  // Edamam Food API
  edamam: {
    baseUrl: 'https://api.edamam.com/api/food-database/v2',
    endpoints: {
      search: '/parser',
      nutrients: '/nutrients',
    },
    params: {
      app_id: import.meta.env.VITE_EDAMAM_APP_ID || '',
      app_key: import.meta.env.VITE_EDAMAM_APP_KEY || '',
    },
  },
  
  // ExerciseDB API
  exerciseDB: {
    baseUrl: 'https://api.api-ninjas.com/v1',
    endpoints: {
      exercises: '/exercises',
    },
    headers: {
      'X-Api-Key': import.meta.env.VITE_EXERCISEDB_API_KEY || '',
    },
  },
  
  // Request timeouts (in milliseconds)
  timeouts: {
    default: 10000, // 10 seconds
    search: 5000,   // 5 seconds for search operations
  },
  
  // Cache settings (in milliseconds)
  cache: {
    ttl: 1000 * 60 * 60, // 1 hour
    maxSize: 100,        // Max number of items to cache
  },
};

export default API_CONFIG;
