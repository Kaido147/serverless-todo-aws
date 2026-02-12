(() => {
  const cfg = window.APP_CONFIG || {};
  const THEME_STORAGE_KEY = "theme";

  const STATUS_ORDER = ["NOT_STARTED", "IN_PROGRESS", "DONE"];

  const STATUS_LABEL_FROM_CODE = {
    NOT_STARTED: "Not Started",
    IN_PROGRESS: "In Progress",
    DONE: "Done",
  };

  const STATUS_CODE_FROM_LABEL = {
    "Not Started": "NOT_STARTED",
    "In Progress": "IN_PROGRESS",
    Done: "DONE",
  };

  const state = {
    tasks: [],
    allTasks: [],
    categories: [],
    dragTaskId: null,
    currentCategory: "",
  };

  const $ = (id) => document.getElementById(id);

  function safeStr(v) {
    return (v ?? "").toString();
  }

  function escapeHtml(str) {
    return safeStr(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeHtmlAttr(str) {
    return escapeHtml(str).replaceAll("`", "&#096;");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return safeStr(value).replace(/"/g, '\\"');
  }

  function apiUrl(path) {
    const base = (cfg.API_BASE_URL || "").replace(/\/$/, "");
    return base + path;
  }

  function tasksPath() {
    return cfg.TASKS_PATH || "/tasks";
  }

  function taskByIdPath(id) {
    const tpl = cfg.TASK_BY_ID_PATH || "/tasks/{id}";
    return tpl.replace("{id}", encodeURIComponent(id));
  }

  function categoriesPath() {
    return cfg.CATEGORIES_PATH || "/categories";
  }

  function formatDue(dateStr) {
    if (!dateStr) return "No due";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "No due";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function toStatusCode(anyStatus) {
    const s = safeStr(anyStatus).trim();
    if (STATUS_ORDER.includes(s)) return s;
    if (STATUS_CODE_FROM_LABEL[s]) return STATUS_CODE_FROM_LABEL[s];
    return "NOT_STARTED";
  }

  function toStatusLabel(anyStatus) {
    const s = safeStr(anyStatus).trim();
    if (STATUS_LABEL_FROM_CODE[s]) return STATUS_LABEL_FROM_CODE[s];
    if (STATUS_CODE_FROM_LABEL[s]) return s;
    return "Not Started";
  }

  function normalizeTask(raw) {
    const id = raw.id ?? raw.taskId ?? raw._id ?? "";
    const due = raw.due_date ?? raw.dueDate ?? "";

    return {
      id: safeStr(id),
      title: safeStr(raw.title || "Untitled Task"),
      category: safeStr(raw.category || ""),
      status: toStatusCode(raw.status || "Not Started"),
      due_date: safeStr(due || ""),
      description: safeStr(raw.description || ""),
      created_at: safeStr(raw.created_at || ""),
      updated_at: safeStr(raw.updated_at || ""),
    };
  }

  function percentOf(count, total) {
    if (!total) return 0;
    return (count / total) * 100;
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "0%";
    const rounded = Math.round(value * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  }

  let toastTimer = null;
  function toast(msg, isError = false) {
    clearTimeout(toastTimer);

    let box = document.getElementById("toastBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastBox";
      box.style.position = "fixed";
      box.style.top = "18px";
      box.style.right = "18px";
      box.style.padding = "10px 12px";
      box.style.borderRadius = "12px";
      box.style.border = "1px solid var(--toast-border)";
      box.style.background = "var(--toast-bg)";
      box.style.boxShadow = "0 18px 45px rgba(0,0,0,0.12)";
      box.style.fontSize = "13px";
      box.style.zIndex = "9999";
      document.body.appendChild(box);
    }

    box.textContent = msg;
    if (isError) {
      box.style.color = "#b91c1c";
      box.style.borderColor = "#fecaca";
      box.style.background = "#fff1f2";
    } else {
      box.style.color = "var(--toast-text)";
      box.style.borderColor = "var(--toast-border)";
      box.style.background = "var(--toast-bg)";
    }
    box.style.display = "block";

    toastTimer = setTimeout(() => {
      box.style.display = "none";
    }, 2500);
  }

  function setTitle() {
    const name = (cfg.STUDENT_NAME || "Student").trim();
    const titleEl = $("pageTitle");
    if (titleEl) titleEl.textContent = `${name}'s To Do List`;
  }

  function setLoading(on) {
    const btn = $("btnRefresh");
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? "Loading..." : "↻ Refresh";
  }

  function getTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    return current === "dark" ? "dark" : "light";
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const btn = $("btnTheme");
    if (btn) btn.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
  }

  function initTheme() {
    const btn = $("btnTheme");
    if (!btn) return;
    setTheme(getTheme());
    btn.addEventListener("click", () => {
      setTheme(getTheme() === "dark" ? "light" : "dark");
    });
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
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
          ? (data.message || data.error)
          : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function loadCategories() {
    try {
      const data = await apiFetch(categoriesPath(), { method: "GET" });
      const arr = Array.isArray(data) ? data : data?.items || data?.categories || [];
      const cats = arr
        .map((x) => (typeof x === "string" ? x : x?.name || x?.category || ""))
        .map((s) => safeStr(s).trim())
        .filter(Boolean);

      state.categories = Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b));
      fillModalCategorySelect();
      fillCategoryFilterSelect();
    } catch (err) {
      console.warn("GET /categories failed:", err);
      state.categories = [];
    }
  }

  async function loadAllTasksForStats() {
    const data = await apiFetch(tasksPath(), { method: "GET" });
    const arr = Array.isArray(data) ? data : data?.items || data?.tasks || [];
    state.allTasks = arr.map(normalizeTask).filter((t) => t.id);
    renderStatsModal(computeStats(state.allTasks));
  }

  async function loadTasksByCategory(category) {
    try {
      setLoading(true);
      state.currentCategory = category || "";

      const path = state.currentCategory
        ? `${tasksPath()}?category=${encodeURIComponent(state.currentCategory)}`
        : tasksPath();

      const data = await apiFetch(path, { method: "GET" });
      const arr = Array.isArray(data) ? data : data?.items || data?.tasks || [];
      state.tasks = arr.map(normalizeTask).filter((t) => t.id);

      render();
      fillCategoryFilterFromTasks();
      fillModalCategoryFromTasks();

      if (state.currentCategory) {
        await loadAllTasksForStats();
      } else {
        state.allTasks = [...state.tasks];
        renderStatsModal(computeStats(state.allTasks));
      }
    } catch (err) {
      console.error(err);
      toast(`Load failed: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  }

  async function getTaskById(id) {
    const data = await apiFetch(taskByIdPath(id), { method: "GET" });
    return normalizeTask(data);
  }

  async function createTask(payload) {
    await apiFetch(tasksPath(), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function updateTask(id, payload) {
    await apiFetch(taskByIdPath(id), {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async function removeTask(id) {
    await apiFetch(taskByIdPath(id), { method: "DELETE" });
  }

  function render() {
    for (const statusCode of STATUS_ORDER) {
      const body = document.querySelector(`.column__body[data-drop="${cssEscape(statusCode)}"]`);
      if (body) body.innerHTML = "";

      const count = document.querySelector(`.count[data-count="${cssEscape(statusCode)}"]`);
      if (count) count.textContent = "0";
    }

    const counts = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0 };
    const list = filterAndSortTasks(state.tasks);

    for (const t of list) {
      counts[t.status]++;
      const body = document.querySelector(`.column__body[data-drop="${cssEscape(t.status)}"]`);
      if (!body) continue;
      body.appendChild(renderCard(t));
    }

    for (const k of Object.keys(counts)) {
      const countEl = document.querySelector(`.count[data-count="${cssEscape(k)}"]`);
      if (countEl) countEl.textContent = String(counts[k]);
    }
  }

  function filterAndSortTasks(tasks) {
    const q = safeStr($("searchInput")?.value).trim().toLowerCase();
    const sortMode = $("sortSelect")?.value || "recent";

    let list = [...tasks];

    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q));

    if (sortMode === "dueSoon") {
      list.sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return safeStr(b.created_at).localeCompare(safeStr(a.created_at));
      });
    } else {
      list.sort((a, b) => safeStr(b.created_at).localeCompare(safeStr(a.created_at)));
    }

    return list;
  }

  function renderCard(t) {
    const card = document.createElement("div");
    card.className = "card";
    card.draggable = true;
    card.dataset.id = t.id;

    const categoryBadge = t.category
      ? `<span class="badge">${escapeHtml(t.category)}</span>`
      : `<span class="badge">Uncategorized</span>`;

    const dueHtml = `<span class="due-inline" title="Due date">${escapeHtml(formatDue(t.due_date))}</span>`;

    card.innerHTML = `
      <div class="card__top">
        ${categoryBadge}
        <button class="card__menu" type="button" title="Edit" aria-label="Edit">⋯</button>
      </div>
      <div class="card__title">${escapeHtml(t.title)}</div>
      <div class="card__footer">${dueHtml}</div>
    `;

    card.querySelector(".card__menu").addEventListener("click", (e) => {
      e.stopPropagation();
      openModalForEdit(t.id);
    });

    card.addEventListener("click", () => openModalForEdit(t.id));

    card.addEventListener("dragstart", (e) => {
      state.dragTaskId = t.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", t.id);
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      state.dragTaskId = null;
    });

    return card;
  }

  function computeStats(tasks) {
    const total = tasks.length;
    const byStatus = STATUS_ORDER.map((statusCode) => {
      const count = tasks.filter((t) => t.status === statusCode).length;
      const percent = percentOf(count, total);
      return {
        key: statusCode,
        label: toStatusLabel(statusCode),
        count,
        percent,
      };
    });

    const doneCount = byStatus.find((s) => s.key === "DONE")?.count || 0;
    const categoryMap = new Map();
    for (const task of tasks) {
      const key = safeStr(task.category).trim() || "Uncategorized";
      categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
    }

    const byCategory = Array.from(categoryMap.entries())
      .map(([label, count]) => ({
        label,
        count,
        percent: percentOf(count, total),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.label.localeCompare(b.label);
      });

    return {
      total,
      completedPercent: percentOf(doneCount, total),
      byStatus,
      byCategory,
    };
  }

  function renderStatRows(containerId, rows) {
    const container = $(containerId);
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
      if (containerId === "statsByStatus" && row.key) {
        wrapper.dataset.status = row.key;
      }

      const label = document.createElement("div");
      label.className = "stat-label";
      label.textContent = row.label;

      const count = document.createElement("div");
      count.className = "stat-count";
      count.textContent = String(row.count);

      const percent = document.createElement("div");
      percent.className = "stat-percent";
      percent.textContent = formatPercent(row.percent);

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

  function renderStatsModal(stats) {
    if ($("statsTotal")) $("statsTotal").textContent = String(stats.total);
    if ($("statsCompleted")) $("statsCompleted").textContent = formatPercent(stats.completedPercent);
    renderStatRows("statsByStatus", stats.byStatus);
    renderStatRows("statsByCategory", stats.byCategory);
  }

  function openModal() {
    $("modal")?.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    $("modal")?.setAttribute("aria-hidden", "true");
    $("taskForm")?.reset();
    if ($("taskId")) $("taskId").value = "";
    if ($("btnDelete")) $("btnDelete").style.display = "none";
    if ($("descriptionEditor")) $("descriptionEditor").innerHTML = "";
    if ($("descriptionInput")) $("descriptionInput").value = "";
    if ($("categoryNew")) $("categoryNew").value = "";
  }

  function openStatsModal() {
    renderStatsModal(computeStats(state.allTasks));
    $("statsModal")?.setAttribute("aria-hidden", "false");
  }

  function closeStatsModal() {
    $("statsModal")?.setAttribute("aria-hidden", "true");
  }

  function openModalForNew() {
    $("modalTitle").textContent = "Add New Task";
    $("btnDelete").style.display = "none";
    $("taskId").value = "";
    $("titleInput").value = "";
    $("statusInput").value = "Not Started";
    $("dueInput").value = "";
    $("categorySelect").value = "";
    $("categoryNew").value = "";
    $("descriptionEditor").innerHTML = "";
    $("descriptionInput").value = "";
    fillModalCategorySelect();
    fillModalCategoryFromTasks();
    openModal();
    $("titleInput").focus();
  }

  async function openModalForEdit(id) {
    $("modalTitle").textContent = "Edit Task";
    $("btnDelete").style.display = "inline-block";
    $("taskId").value = id;
    openModal();
    toast("Loading task...");

    try {
      const t = await getTaskById(id);
      const idx = state.tasks.findIndex((x) => x.id === id);
      if (idx >= 0) state.tasks[idx] = t;

      $("titleInput").value = t.title || "";
      $("statusInput").value = toStatusLabel(t.status);
      $("dueInput").value = t.due_date || "";
      fillModalCategorySelect();
      fillModalCategoryFromTasks();
      addCategoryToModalSelect(t.category || "");
      $("descriptionEditor").innerHTML = t.description || "";
      $("descriptionInput").value = t.description || "";
    } catch (err) {
      console.error(err);
      toast(`Failed to load task: ${err.message}`, true);
      closeModal();
    }
  }

  function initDnD() {
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
        const id = e.dataTransfer.getData("text/plain") || state.dragTaskId;
        if (!id) return;

        const task = state.tasks.find((t) => t.id === id);
        if (!task || task.status === newStatusCode) return;

        const prev = task.status;
        task.status = newStatusCode;
        render();

        try {
          await updateTask(id, { status: toStatusLabel(newStatusCode) });
          toast(`Moved to ${toStatusLabel(newStatusCode)}.`);
          await loadTasksByCategory(state.currentCategory);
        } catch (err) {
          console.error(err);
          task.status = prev;
          render();
          toast(`Move failed: ${err.message}`, true);
        }
      });
    });
  }

  function initModal() {
    $("btnNew").addEventListener("click", openModalForNew);
    $("btnCancel").addEventListener("click", closeModal);
    $("modalClose").addEventListener("click", closeModal);
    $("modalBackdrop").addEventListener("click", closeModal);

    $("btnAddCategory").addEventListener("click", () => {
      const v = $("categoryNew").value.trim();
      if (!v) return;
      addCategoryToModalSelect(v);
      $("categoryNew").value = "";
    });

    $("categoryNew").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        $("btnAddCategory").click();
      }
    });

    document.querySelectorAll(".rte__btn[data-cmd]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cmd = btn.getAttribute("data-cmd");
        document.execCommand(cmd, false, null);
        $("descriptionEditor").focus();
      });
    });

    $("descriptionEditor").addEventListener("input", () => {
      $("descriptionInput").value = $("descriptionEditor").innerHTML;
    });

    $("btnDelete").addEventListener("click", async () => {
      const id = $("taskId").value;
      if (!id || !confirm("Delete this task?")) return;

      try {
        await removeTask(id);
        toast("Deleted.");
        closeModal();
        await loadCategories();
        await ensureValidCategoryFilterAndReload();
        await loadTasksByCategory(state.currentCategory || "");
      } catch (err) {
        console.error(err);
        toast(`Delete failed: ${err.message}`, true);
      }
    });

    $("taskForm").addEventListener("submit", async (e) => {
      e.preventDefault();

      const id = $("taskId").value;
      const categoryValue = $("categorySelect").value || $("categoryNew").value.trim();
      const descriptionHtml = $("descriptionInput").value || $("descriptionEditor").innerHTML || "";

      const payload = {
        title: $("titleInput").value.trim(),
        category: categoryValue,
        due_date: $("dueInput").value,
        status: $("statusInput").value,
        description: descriptionHtml,
      };

      if (!payload.title) return toast("Title is required.", true);
      if (!payload.category) return toast("Category is required.", true);

      try {
        if (!id) {
          await createTask(payload);
          toast("Created.");
        } else {
          await updateTask(id, payload);
          toast("Updated.");
        }

        closeModal();
        await loadCategories();
        await ensureValidCategoryFilterAndReload();
        await loadTasksByCategory(state.currentCategory || "");
      } catch (err) {
        console.error(err);
        toast(`Save failed: ${err.message}`, true);
      }
    });
  }

  function initStatsModal() {
    $("btnStats")?.addEventListener("click", openStatsModal);
    $("statsClose")?.addEventListener("click", closeStatsModal);
    $("statsBackdrop")?.addEventListener("click", closeStatsModal);

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if ($("statsModal")?.getAttribute("aria-hidden") === "false") closeStatsModal();
      if ($("modal")?.getAttribute("aria-hidden") === "false") closeModal();
    });
  }

  function fillCategoryFilterSelect() {
    const select = $("categoryFilter");
    if (!select) return;

    const current = select.value;
    const cats = state.categories || [];

    select.innerHTML =
      `<option value="">All</option>` +
      cats.map((c) => `<option value="${escapeHtmlAttr(c)}">${escapeHtml(c)}</option>`).join("");

    if (cats.includes(current)) select.value = current;
  }

  function fillCategoryFilterFromTasks() {
    const select = $("categoryFilter");
    if (!select) return;

    const existing = new Set(Array.from(select.options).map((o) => o.value).filter(Boolean));
    const fromTasks = Array.from(new Set(state.tasks.map((t) => t.category).filter(Boolean)));
    for (const c of fromTasks) existing.add(c);

    const merged = Array.from(existing).sort((a, b) => a.localeCompare(b));
    const current = select.value;

    select.innerHTML =
      `<option value="">All</option>` +
      merged.map((c) => `<option value="${escapeHtmlAttr(c)}">${escapeHtml(c)}</option>`).join("");

    if (merged.includes(current)) select.value = current;
  }

  function fillModalCategorySelect() {
    const select = $("categorySelect");
    if (!select) return;

    const current = select.value;
    const cats = state.categories || [];

    select.innerHTML =
      `<option value="">Select category...</option>` +
      cats.map((c) => `<option value="${escapeHtmlAttr(c)}">${escapeHtml(c)}</option>`).join("");

    if (cats.includes(current)) select.value = current;
  }

  function fillModalCategoryFromTasks() {
    const select = $("categorySelect");
    if (!select) return;

    const existing = new Set(Array.from(select.options).map((o) => o.value).filter(Boolean));
    const fromTasks = Array.from(new Set(state.tasks.map((t) => t.category).filter(Boolean)));
    for (const c of fromTasks) existing.add(c);

    const merged = Array.from(existing).sort((a, b) => a.localeCompare(b));
    const current = select.value;

    select.innerHTML =
      `<option value="">Select category...</option>` +
      merged.map((c) => `<option value="${escapeHtmlAttr(c)}">${escapeHtml(c)}</option>`).join("");

    if (merged.includes(current)) select.value = current;
  }

  function addCategoryToModalSelect(name) {
    const select = $("categorySelect");
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

  async function ensureValidCategoryFilterAndReload() {
    if (state.currentCategory && !state.categories.includes(state.currentCategory)) {
      state.currentCategory = "";
      const select = $("categoryFilter");
      if (select) select.value = "";
      await loadTasksByCategory("");
    }
  }

  function initControls() {
    $("searchInput").addEventListener("input", render);
    $("sortSelect").addEventListener("change", render);

    $("categoryFilter").addEventListener("change", async () => {
      const selected = $("categoryFilter").value || "";
      await loadTasksByCategory(selected);
    });

    $("btnRefresh").addEventListener("click", async () => {
      await loadTasksByCategory(state.currentCategory);
      await loadCategories();
    });
  }

  async function init() {
    setTitle();
    initTheme();
    initControls();
    initDnD();
    initModal();
    initStatsModal();

    await loadCategories();
    await loadTasksByCategory("");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
