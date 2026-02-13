(function () {
  class TaskApi {
    constructor(cfg, utils) {
      this.cfg = cfg || {};
      this.utils = utils;
    }

    apiUrl(path) {
      const base = (this.cfg.API_BASE_URL || "").replace(/\/$/, "");
      return base + path;
    }

    tasksPath() {
      return this.cfg.TASKS_PATH || "/tasks";
    }

    taskByIdPath(id) {
      const tpl = this.cfg.TASK_BY_ID_PATH || "/tasks/{id}";
      return tpl.replace("{id}", encodeURIComponent(id));
    }

    categoriesPath() {
      return this.cfg.CATEGORIES_PATH || "/categories";
    }

    async apiFetch(path, options) {
      const res = await fetch(this.apiUrl(path), {
        ...(options || {}),
        headers: {
          "Content-Type": "application/json",
          ...((options && options.headers) || {}),
        },
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!res.ok) {
        const msg =
          data && (data.message || data.error)
            ? data.message || data.error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return data;
    }

    async fetchCategories() {
      const data = await this.apiFetch(this.categoriesPath(), { method: "GET" });
      const arr = Array.isArray(data) ? data : data?.items || data?.categories || [];
      return arr
        .map((x) => (typeof x === "string" ? x : x?.name || x?.category || ""))
        .map((s) => this.utils.safeStr(s).trim())
        .filter(Boolean);
    }

    async fetchTasksByCategory(category) {
      const path = category
        ? `${this.tasksPath()}?category=${encodeURIComponent(category)}`
        : this.tasksPath();
      const data = await this.apiFetch(path, { method: "GET" });
      return Array.isArray(data) ? data : data?.items || data?.tasks || [];
    }

    async getTaskById(id) {
      return this.apiFetch(this.taskByIdPath(id), { method: "GET" });
    }

    async createTask(payload) {
      return this.apiFetch(this.tasksPath(), {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    async updateTask(id, payload) {
      return this.apiFetch(this.taskByIdPath(id), {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    }

    async removeTask(id) {
      return this.apiFetch(this.taskByIdPath(id), { method: "DELETE" });
    }
  }

  window.TaskApi = TaskApi;
})();
