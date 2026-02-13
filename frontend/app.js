(() => {
  document.addEventListener("DOMContentLoaded", async () => {
    const app = new window.TodoApp(window.APP_CONFIG || {});
    window.todoApp = app;
    await app.init();
  });
})();
