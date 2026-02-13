(function () {
  class TodoApp {
    constructor(cfg) {
      this.cfg = cfg || {};
      this.utils = window.DomUtils;
      this.api = new window.TaskApi(this.cfg, this.utils);
      this.notify = new window.NotificationService(document);

      this.STATUS_ORDER = ["NOT_STARTED", "IN_PROGRESS", "DONE"];
      this.STATUS_LABEL_FROM_CODE = {
        NOT_STARTED: "Not Started",
        IN_PROGRESS: "In Progress",
        DONE: "Done",
      };
      this.STATUS_CODE_FROM_LABEL = {
        "Not Started": "NOT_STARTED",
        "In Progress": "IN_PROGRESS",
        Done: "DONE",
      };
      this.THEME_STORAGE_KEY = "theme";

      this.statsService = new window.StatsService(
        this.STATUS_ORDER,
        (value) => this.toStatusLabel(value),
        this.utils
      );

      this.state = {
        tasks: [],
        allTasks: [],
        categories: [],
        dragTaskId: null,
        currentCategory: "",
      };
    }

    $(id) {
      return this.utils.byId(id);
    }

    formatDue(dateStr) {
      if (!dateStr) return "No due";
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return "No due";
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    toStatusCode(anyStatus) {
      const s = this.utils.safeStr(anyStatus).trim();
      if (this.STATUS_ORDER.includes(s)) return s;
      if (this.STATUS_CODE_FROM_LABEL[s]) return this.STATUS_CODE_FROM_LABEL[s];
      return "NOT_STARTED";
    }

    toStatusLabel(anyStatus) {
      const s = this.utils.safeStr(anyStatus).trim();
      if (this.STATUS_LABEL_FROM_CODE[s]) return this.STATUS_LABEL_FROM_CODE[s];
      if (this.STATUS_CODE_FROM_LABEL[s]) return s;
      return "Not Started";
    }

    normalizeTask(raw) {
      const id = raw.id ?? raw.taskId ?? raw._id ?? "";
      const due = raw.due_date ?? raw.dueDate ?? "";
      return {
        id: this.utils.safeStr(id),
        title: this.utils.safeStr(raw.title || "Untitled Task"),
        category: this.utils.safeStr(raw.category || ""),
        status: this.toStatusCode(raw.status || "Not Started"),
        due_date: this.utils.safeStr(due || ""),
        description: this.utils.safeStr(raw.description || ""),
        created_at: this.utils.safeStr(raw.created_at || ""),
        updated_at: this.utils.safeStr(raw.updated_at || ""),
      };
    }

    setTitle() {
      const name = (this.cfg.STUDENT_NAME || "Student").trim();
      const titleEl = this.$("pageTitle");
      if (titleEl) titleEl.textContent = `${name}'s To Do List`;
    }

    setLoading(on) {
      const btn = this.$("btnRefresh");
      if (!btn) return;
      btn.disabled = on;
      btn.textContent = on ? "Loading..." : "\u21bb Refresh";
    }

    getTheme() {
      return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }

    setTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(this.THEME_STORAGE_KEY, theme);
      const btn = this.$("btnTheme");
      if (btn) btn.textContent = theme === "dark" ? "\u2600\ufe0f Light" : "\ud83c\udf19 Dark";
    }

    initTheme() {
      const btn = this.$("btnTheme");
      if (!btn) return;
      this.setTheme(this.getTheme());
      btn.addEventListener("click", () => {
        this.setTheme(this.getTheme() === "dark" ? "light" : "dark");
      });
    }

    async loadCategories() {
      try {
        const cats = await this.api.fetchCategories();
        this.state.categories = Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b));
        this.fillModalCategorySelect();
        this.fillCategoryFilterSelect();
      } catch (err) {
        console.warn("GET /categories failed:", err);
        this.state.categories = [];
      }
    }

    async loadAllTasksForStats() {
      const rows = await this.api.fetchTasksByCategory("");
      this.state.allTasks = rows.map((t) => this.normalizeTask(t)).filter((t) => t.id);
      this.renderStatsModal(this.statsService.computeStats(this.state.allTasks));
    }

    async loadTasksByCategory(category) {
      try {
        this.setLoading(true);
        this.state.currentCategory = category || "";
        const rows = await this.api.fetchTasksByCategory(this.state.currentCategory);
        this.state.tasks = rows.map((t) => this.normalizeTask(t)).filter((t) => t.id);

        this.render();
        this.fillCategoryFilterFromTasks();
        this.fillModalCategoryFromTasks();

        if (this.state.currentCategory) {
          await this.loadAllTasksForStats();
        } else {
          this.state.allTasks = [...this.state.tasks];
          this.renderStatsModal(this.statsService.computeStats(this.state.allTasks));
        }
      } catch (err) {
        console.error(err);
        this.notify.toast(`Load failed: ${err.message}`, true);
      } finally {
        this.setLoading(false);
      }
    }

    render() {
      for (const statusCode of this.STATUS_ORDER) {
        const body = document.querySelector(`.column__body[data-drop="${this.utils.cssEscape(statusCode)}"]`);
        if (body) body.innerHTML = "";
        const count = document.querySelector(`.count[data-count="${this.utils.cssEscape(statusCode)}"]`);
        if (count) count.textContent = "0";
      }

      const counts = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0 };
      const list = this.filterAndSortTasks(this.state.tasks);
      for (const t of list) {
        counts[t.status]++;
        const body = document.querySelector(`.column__body[data-drop="${this.utils.cssEscape(t.status)}"]`);
        if (body) body.appendChild(this.renderCard(t));
      }

      for (const k of Object.keys(counts)) {
        const countEl = document.querySelector(`.count[data-count="${this.utils.cssEscape(k)}"]`);
        if (countEl) countEl.textContent = String(counts[k]);
      }
    }

    filterAndSortTasks(tasks) {
      const q = this.utils.safeStr(this.$("searchInput")?.value).trim().toLowerCase();
      const sortMode = this.$("sortSelect")?.value || "recent";
      let list = [...tasks];
      if (q) list = list.filter((t) => t.title.toLowerCase().includes(q));

      if (sortMode === "dueSoon") {
        list.sort((a, b) => {
          const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
          const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
          if (ad !== bd) return ad - bd;
          return this.utils.safeStr(b.created_at).localeCompare(this.utils.safeStr(a.created_at));
        });
      } else {
        list.sort((a, b) => this.utils.safeStr(b.created_at).localeCompare(this.utils.safeStr(a.created_at)));
      }
      return list;
    }

    renderCard(task) {
      const card = document.createElement("div");
      card.className = "card";
      card.draggable = true;
      card.dataset.id = task.id;

      const categoryBadge = task.category
        ? `<span class="badge">${this.utils.escapeHtml(task.category)}</span>`
        : `<span class="badge">Uncategorized</span>`;
      const dueHtml = `<span class="due-inline" title="Due date">${this.utils.escapeHtml(this.formatDue(task.due_date))}</span>`;

      card.innerHTML = `
        <div class="card__top">
          ${categoryBadge}
          <button class="card__menu" type="button" title="Edit" aria-label="Edit">...</button>
        </div>
        <div class="card__title">${this.utils.escapeHtml(task.title)}</div>
        <div class="card__footer">${dueHtml}</div>
      `;

      card.querySelector(".card__menu").addEventListener("click", (e) => {
        e.stopPropagation();
        this.openModalForEdit(task.id);
      });
      card.addEventListener("click", () => this.openModalForEdit(task.id));
      card.addEventListener("dragstart", (e) => {
        this.state.dragTaskId = task.id;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        this.state.dragTaskId = null;
      });
      return card;
    }

    renderStatRows(containerId, rows) {
      const container = this.$(containerId);
      if (!container) return;
      container.innerHTML = "";
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "stats-empty";
        empty.textContent = "No data";
        container.appendChild(empty);
        return;
      }

      for (const row of rows) {
        const wrapper = document.createElement("div");
        wrapper.className = "stat-row";
        if (containerId === "statsByStatus" && row.key) wrapper.dataset.status = row.key;

        const label = document.createElement("div");
        label.className = "stat-label";
        label.textContent = row.label;

        const count = document.createElement("div");
        count.className = "stat-count";
        count.textContent = String(row.count);

        const percent = document.createElement("div");
        percent.className = "stat-percent";
        percent.textContent = this.statsService.formatPercent(row.percent);

        const bar = document.createElement("div");
        bar.className = "stat-bar";
        const fill = document.createElement("div");
        fill.className = "stat-bar__fill";
        if (containerId === "statsByStatus") {
          if (row.key === "NOT_STARTED") fill.style.background = "linear-gradient(90deg, #3b82f6, #60a5fa)";
          if (row.key === "IN_PROGRESS") fill.style.background = "linear-gradient(90deg, #6366f1, #818cf8)";
          if (row.key === "DONE") fill.style.background = "linear-gradient(90deg, #22c55e, #4ade80)";
        }
        const width = row.count > 0 ? Math.max(row.percent, 2) : 0;
        fill.style.width = `${Math.min(width, 100)}%`;
        bar.appendChild(fill);

        wrapper.appendChild(label);
        wrapper.appendChild(count);
        wrapper.appendChild(percent);
        wrapper.appendChild(bar);
        container.appendChild(wrapper);
      }
    }

    renderStatsModal(stats) {
      if (this.$("statsTotal")) this.$("statsTotal").textContent = String(stats.total);
      if (this.$("statsCompleted")) {
        this.$("statsCompleted").textContent = this.statsService.formatPercent(stats.completedPercent);
      }
      this.renderStatRows("statsByStatus", stats.byStatus);
      this.renderStatRows("statsByCategory", stats.byCategory);
    }

    openTaskModal() {
      this.$("modal")?.setAttribute("aria-hidden", "false");
    }

    closeTaskModal() {
      this.$("modal")?.setAttribute("aria-hidden", "true");
      this.$("taskForm")?.reset();
      if (this.$("taskId")) this.$("taskId").value = "";
      if (this.$("btnDelete")) this.$("btnDelete").style.display = "none";
      if (this.$("descriptionEditor")) this.$("descriptionEditor").innerHTML = "";
      if (this.$("descriptionInput")) this.$("descriptionInput").value = "";
      if (this.$("categoryNew")) this.$("categoryNew").value = "";
    }

    openStatsModal() {
      this.renderStatsModal(this.statsService.computeStats(this.state.allTasks));
      this.$("statsModal")?.setAttribute("aria-hidden", "false");
    }

    closeStatsModal() {
      this.$("statsModal")?.setAttribute("aria-hidden", "true");
    }

    openModalForNew() {
      this.$("modalTitle").textContent = "Add New Task";
      this.$("btnDelete").style.display = "none";
      this.$("taskId").value = "";
      this.$("titleInput").value = "";
      this.$("statusInput").value = "Not Started";
      this.$("dueInput").value = "";
      this.$("categorySelect").value = "";
      this.$("categoryNew").value = "";
      this.$("descriptionEditor").innerHTML = "";
      this.$("descriptionInput").value = "";
      this.fillModalCategorySelect();
      this.fillModalCategoryFromTasks();
      this.openTaskModal();
      this.$("titleInput").focus();
    }

    async openModalForEdit(id) {
      this.$("modalTitle").textContent = "Edit Task";
      this.$("btnDelete").style.display = "inline-block";
      this.$("taskId").value = id;
      this.openTaskModal();
      this.notify.toast("Loading task...");

      try {
        const raw = await this.api.getTaskById(id);
        const task = this.normalizeTask(raw);
        const idx = this.state.tasks.findIndex((x) => x.id === id);
        if (idx >= 0) this.state.tasks[idx] = task;

        this.$("titleInput").value = task.title || "";
        this.$("statusInput").value = this.toStatusLabel(task.status);
        this.$("dueInput").value = task.due_date || "";
        this.fillModalCategorySelect();
        this.fillModalCategoryFromTasks();
        this.addCategoryToModalSelect(task.category || "");
        this.$("descriptionEditor").innerHTML = task.description || "";
        this.$("descriptionInput").value = task.description || "";
      } catch (err) {
        console.error(err);
        this.notify.toast(`Failed to load task: ${err.message}`, true);
        this.closeTaskModal();
      }
    }

    initDnD() {
      document.querySelectorAll(".droppable").forEach((zone) => {
        zone.addEventListener("dragover", (e) => {
          e.preventDefault();
          zone.classList.add("dragover");
        });
        zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
        zone.addEventListener("drop", async (e) => {
          e.preventDefault();
          zone.classList.remove("dragover");

          const newStatusCode = zone.dataset.drop;
          const id = e.dataTransfer.getData("text/plain") || this.state.dragTaskId;
          if (!id) return;

          const task = this.state.tasks.find((t) => t.id === id);
          if (!task || task.status === newStatusCode) return;

          const prev = task.status;
          task.status = newStatusCode;
          this.render();

          try {
            await this.api.updateTask(id, { status: this.toStatusLabel(newStatusCode) });
            this.notify.toast(`Moved to ${this.toStatusLabel(newStatusCode)}.`);
            await this.loadTasksByCategory(this.state.currentCategory);
          } catch (err) {
            console.error(err);
            task.status = prev;
            this.render();
            this.notify.toast(`Move failed: ${err.message}`, true);
          }
        });
      });
    }

    initTaskModal() {
      this.$("btnNew").addEventListener("click", () => this.openModalForNew());
      this.$("btnCancel").addEventListener("click", () => this.closeTaskModal());
      this.$("modalClose").addEventListener("click", () => this.closeTaskModal());
      this.$("modalBackdrop").addEventListener("click", () => this.closeTaskModal());

      this.$("btnAddCategory").addEventListener("click", () => {
        const value = this.$("categoryNew").value.trim();
        if (!value) return;
        this.addCategoryToModalSelect(value);
        this.$("categoryNew").value = "";
      });

      this.$("categoryNew").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.$("btnAddCategory").click();
        }
      });

      document.querySelectorAll(".rte__btn[data-cmd]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const cmd = btn.getAttribute("data-cmd");
          document.execCommand(cmd, false, null);
          this.$("descriptionEditor").focus();
        });
      });

      this.$("descriptionEditor").addEventListener("input", () => {
        this.$("descriptionInput").value = this.$("descriptionEditor").innerHTML;
      });

      this.$("btnDelete").addEventListener("click", async () => {
        const id = this.$("taskId").value;
        if (!id || !confirm("Delete this task?")) return;
        try {
          await this.api.removeTask(id);
          this.notify.toast("Deleted.");
          this.closeTaskModal();
          await this.loadCategories();
          await this.ensureValidCategoryFilterAndReload();
          await this.loadTasksByCategory(this.state.currentCategory || "");
        } catch (err) {
          console.error(err);
          this.notify.toast(`Delete failed: ${err.message}`, true);
        }
      });

      this.$("taskForm").addEventListener("submit", async (e) => {
        e.preventDefault();

        const id = this.$("taskId").value;
        const categoryValue = this.$("categorySelect").value || this.$("categoryNew").value.trim();
        const descriptionHtml =
          this.$("descriptionInput").value || this.$("descriptionEditor").innerHTML || "";

        const payload = {
          title: this.$("titleInput").value.trim(),
          category: categoryValue,
          due_date: this.$("dueInput").value,
          status: this.$("statusInput").value,
          description: descriptionHtml,
        };

        if (!payload.title) return this.notify.toast("Title is required.", true);
        if (!payload.category) return this.notify.toast("Category is required.", true);

        try {
          if (!id) {
            await this.api.createTask(payload);
            this.notify.toast("Created.");
          } else {
            await this.api.updateTask(id, payload);
            this.notify.toast("Updated.");
          }
          this.closeTaskModal();
          await this.loadCategories();
          await this.ensureValidCategoryFilterAndReload();
          await this.loadTasksByCategory(this.state.currentCategory || "");
        } catch (err) {
          console.error(err);
          this.notify.toast(`Save failed: ${err.message}`, true);
        }
      });
    }

    initStatsModal() {
      this.$("btnStats")?.addEventListener("click", () => this.openStatsModal());
      this.$("statsClose")?.addEventListener("click", () => this.closeStatsModal());
      this.$("statsBackdrop")?.addEventListener("click", () => this.closeStatsModal());

      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (this.$("statsModal")?.getAttribute("aria-hidden") === "false") this.closeStatsModal();
        if (this.$("modal")?.getAttribute("aria-hidden") === "false") this.closeTaskModal();
      });
    }

    fillCategoryFilterSelect() {
      const select = this.$("categoryFilter");
      if (!select) return;
      const current = select.value;
      const cats = this.state.categories || [];

      select.innerHTML =
        `<option value="">All</option>` +
        cats
          .map(
            (c) =>
              `<option value="${this.utils.escapeHtmlAttr(c)}">${this.utils.escapeHtml(c)}</option>`
          )
          .join("");
      if (cats.includes(current)) select.value = current;
    }

    fillCategoryFilterFromTasks() {
      const select = this.$("categoryFilter");
      if (!select) return;

      const existing = new Set(Array.from(select.options).map((o) => o.value).filter(Boolean));
      const fromTasks = Array.from(new Set(this.state.tasks.map((t) => t.category).filter(Boolean)));
      for (const c of fromTasks) existing.add(c);

      const merged = Array.from(existing).sort((a, b) => a.localeCompare(b));
      const current = select.value;
      select.innerHTML =
        `<option value="">All</option>` +
        merged
          .map(
            (c) =>
              `<option value="${this.utils.escapeHtmlAttr(c)}">${this.utils.escapeHtml(c)}</option>`
          )
          .join("");
      if (merged.includes(current)) select.value = current;
    }

    fillModalCategorySelect() {
      const select = this.$("categorySelect");
      if (!select) return;
      const current = select.value;
      const cats = this.state.categories || [];

      select.innerHTML =
        `<option value="">Select category...</option>` +
        cats
          .map(
            (c) =>
              `<option value="${this.utils.escapeHtmlAttr(c)}">${this.utils.escapeHtml(c)}</option>`
          )
          .join("");
      if (cats.includes(current)) select.value = current;
    }

    fillModalCategoryFromTasks() {
      const select = this.$("categorySelect");
      if (!select) return;

      const existing = new Set(Array.from(select.options).map((o) => o.value).filter(Boolean));
      const fromTasks = Array.from(new Set(this.state.tasks.map((t) => t.category).filter(Boolean)));
      for (const c of fromTasks) existing.add(c);

      const merged = Array.from(existing).sort((a, b) => a.localeCompare(b));
      const current = select.value;
      select.innerHTML =
        `<option value="">Select category...</option>` +
        merged
          .map(
            (c) =>
              `<option value="${this.utils.escapeHtmlAttr(c)}">${this.utils.escapeHtml(c)}</option>`
          )
          .join("");
      if (merged.includes(current)) select.value = current;
    }

    addCategoryToModalSelect(name) {
      const select = this.$("categorySelect");
      if (!select) return;
      const n = (name || "").trim();
      if (!n) return;

      const exists = Array.from(select.options).some((o) => o.value === n);
      if (!exists) {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = n;
        select.appendChild(opt);
      }
      select.value = n;
    }

    async ensureValidCategoryFilterAndReload() {
      if (this.state.currentCategory && !this.state.categories.includes(this.state.currentCategory)) {
        this.state.currentCategory = "";
        const select = this.$("categoryFilter");
        if (select) select.value = "";
        await this.loadTasksByCategory("");
      }
    }

    initControls() {
      this.$("searchInput").addEventListener("input", () => this.render());
      this.$("sortSelect").addEventListener("change", () => this.render());
      this.$("categoryFilter").addEventListener("change", async () => {
        await this.loadTasksByCategory(this.$("categoryFilter").value || "");
      });
      this.$("btnRefresh").addEventListener("click", async () => {
        await this.loadTasksByCategory(this.state.currentCategory);
        await this.loadCategories();
      });
    }

    async init() {
      this.setTitle();
      this.initTheme();
      this.initControls();
      this.initDnD();
      this.initTaskModal();
      this.initStatsModal();
      await this.loadCategories();
      await this.loadTasksByCategory("");
    }
  }

  window.TodoApp = TodoApp;
})();
