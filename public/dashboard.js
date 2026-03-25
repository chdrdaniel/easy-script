// Author: yuanxun.mei@gmail.com
function toast(message) {
  const node = document.getElementById("toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => node.classList.remove("visible"), 2200);
}

const loadingOverlay = document.getElementById("loading-overlay");
let loadingOverlayCount = 0;

function setLoadingOverlay(loading) {
  if (!loadingOverlay) return;
  if (loading) {
    loadingOverlayCount += 1;
    loadingOverlay.classList.remove("hidden");
    return;
  }
  loadingOverlayCount = Math.max(0, loadingOverlayCount - 1);
  if (loadingOverlayCount === 0) {
    loadingOverlay.classList.add("hidden");
  }
}

async function withLoadingOverlay(task) {
  setLoadingOverlay(true);
  try {
    return await task();
  } finally {
    setLoadingOverlay(false);
  }
}

async function refreshRunning() {
  const res = await fetch("/api/running");
  const data = await res.json();
  if (!data.ok) return;
  const count = document.getElementById("running-count");
  if (count) {
    count.textContent = String(data.running.length);
  }
}

const refreshDashboardBtn = document.getElementById("refresh-dashboard-btn");
if (refreshDashboardBtn) {
  refreshDashboardBtn.onclick = async () => {
    refreshDashboardBtn.disabled = true;
    const original = refreshDashboardBtn.textContent;
    refreshDashboardBtn.textContent = "刷新中...";
    try {
      await withLoadingOverlay(() => refreshRunning());
      toast("列表已刷新");
    } catch (_err) {
      toast("刷新失败，请稍后重试");
    } finally {
      refreshDashboardBtn.disabled = false;
      refreshDashboardBtn.textContent = original;
    }
  };
}

setInterval(() => {
  refreshRunning().catch(() => {});
}, 4000);
