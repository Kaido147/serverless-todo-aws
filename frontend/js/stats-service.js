(function () {
  class StatsService {
    constructor(statusOrder, toStatusLabel, utils) {
      this.statusOrder = statusOrder;
      this.toStatusLabel = toStatusLabel;
      this.utils = utils;
    }

    percentOf(count, total) {
      if (!total) return 0;
      return (count / total) * 100;
    }

    formatPercent(value) {
      if (!Number.isFinite(value)) return "0%";
      const rounded = Math.round(value * 10) / 10;
      return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
    }

    computeStats(tasks) {
      const total = tasks.length;
      const byStatus = this.statusOrder.map((statusCode) => {
        const count = tasks.filter((t) => t.status === statusCode).length;
        return {
          key: statusCode,
          label: this.toStatusLabel(statusCode),
          count,
          percent: this.percentOf(count, total),
        };
      });

      const doneCount = byStatus.find((s) => s.key === "DONE")?.count || 0;
      const categoryMap = new Map();
      for (const task of tasks) {
        const key = this.utils.safeStr(task.category).trim() || "Uncategorized";
        categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
      }

      const byCategory = Array.from(categoryMap.entries())
        .map(([label, count]) => ({
          label,
          count,
          percent: this.percentOf(count, total),
        }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.label.localeCompare(b.label);
        });

      return {
        total,
        completedPercent: this.percentOf(doneCount, total),
        byStatus,
        byCategory,
      };
    }
  }

  window.StatsService = StatsService;
})();
