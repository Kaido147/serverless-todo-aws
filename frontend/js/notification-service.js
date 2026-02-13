(function () {
  class NotificationService {
    constructor(doc) {
      this.doc = doc;
      this.toastTimer = null;
    }

    toast(message, isError) {
      clearTimeout(this.toastTimer);

      let box = this.doc.getElementById("toastBox");
      if (!box) {
        box = this.doc.createElement("div");
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
        this.doc.body.appendChild(box);
      }

      box.textContent = message;
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

      this.toastTimer = setTimeout(() => {
        box.style.display = "none";
      }, 2500);
    }
  }

  window.NotificationService = NotificationService;
})();
