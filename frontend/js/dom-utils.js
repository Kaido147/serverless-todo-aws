(function () {
  class DomUtils {
    static byId(id) {
      return document.getElementById(id);
    }

    static safeStr(value) {
      return (value ?? "").toString();
    }

    static escapeHtml(str) {
      return DomUtils.safeStr(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    static escapeHtmlAttr(str) {
      return DomUtils.escapeHtml(str).replaceAll("`", "&#096;");
    }

    static cssEscape(value) {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return DomUtils.safeStr(value).replace(/"/g, '\\"');
    }
  }

  window.DomUtils = DomUtils;
})();
