// API Client Helper
const api = {
  async request(endpoint, options = {}) {
    const config = {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(endpoint, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(data.error || 'Something went wrong');
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  // Auth endpoints
  async signup(email, password) {
    return this.request('/api/auth/signup', {
      method: 'POST',
      body: { email, password }
    });
  },

  async login(email, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
  },

  async logout() {
    return this.request('/api/auth/logout', {
      method: 'POST'
    });
  },

  async getMe() {
    return this.request('/api/auth/me', {
      method: 'GET'
    });
  },

  // Task endpoints
  async getTasks(status = '') {
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    return this.request(`/api/tasks${query}`, {
      method: 'GET'
    });
  },

  async getTask(id) {
    return this.request(`/api/tasks/${id}`, {
      method: 'GET'
    });
  },

  async createTask(taskData) {
    return this.request('/api/tasks', {
      method: 'POST',
      body: taskData
    });
  },

  async updateTask(id, taskData) {
    return this.request(`/api/tasks/${id}`, {
      method: 'PUT',
      body: taskData
    });
  },

  async deleteTask(id) {
    return this.request(`/api/tasks/${id}`, {
      method: 'DELETE'
    });
  }
};
