// Author: yuanxun.mei@gmail.com
function toast(message) {
  const node = document.getElementById("toast");
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

function setButtonLoading(button, loading, loadingText) {
  if (!button) return;
  if (!button.dataset.label) {
    button.dataset.label = button.textContent.trim();
  }
  if (!loading) {
    button.disabled = false;
    button.classList.remove("btn-loading");
    button.textContent = button.dataset.label;
    button.removeAttribute("aria-busy");
    return;
  }
  button.disabled = true;
  button.classList.add("btn-loading");
  button.setAttribute("aria-busy", "true");
  button.textContent = loadingText || button.dataset.label;
}

function renderStatus(status) {
  return `<span class="status ${status}">${status}</span>`;
}

function renderHistoryRow(item) {
  const duration = typeof item.durationMs === "number" ? `${item.durationMs} ms` : "-";
  const exitCode = item.exitCode ?? "-";
  const stdoutFile = item.stdoutFile || "";
  const stderrFile = item.stderrFile || "";
  return `<tr>
    <td>${item.startTime || "-"}</td>
    <td>${renderStatus(item.status || "unknown")}</td>
    <td>${duration}</td>
    <td>${exitCode}</td>
    <td class="mono">
      out: ${stdoutFile || "-"}<br/>
      err: ${stderrFile || "-"}<br/>
      <button class="log-btn" type="button" data-stdout-file="${stdoutFile}" data-stderr-file="${stderrFile}">查看日志</button>
    </td>
  </tr>`;
}

async function refreshHistory() {
  const scriptId = window.__SCRIPT_ID__;
  const res = await fetch(`/api/history/${encodeURIComponent(scriptId)}`);
  const data = await res.json();
  if (!data.ok) return;
  const tbody = document.getElementById("history-body");
  tbody.innerHTML = data.history.map(renderHistoryRow).join("");
  bindLogActions();
}

async function runScript(scriptId, button) {
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "运行中...";
  try {
    const res = await fetch(`/api/run/${encodeURIComponent(scriptId)}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast(data.message || "启动失败");
      return;
    }
    toast("脚本已启动，请手动刷新列表查看状态");
  } catch (_err) {
    toast("请求失败，请检查服务日志");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

const modalState = {
  stdoutFile: "",
  stderrFile: "",
  activeType: "stdout",
};

function setLogTab(type) {
  modalState.activeType = type;
  const stdoutTab = document.getElementById("stdout-tab");
  const stderrTab = document.getElementById("stderr-tab");
  stdoutTab.classList.toggle("active", type === "stdout");
  stderrTab.classList.toggle("active", type === "stderr");
}

function openLogModal(stdoutFile, stderrFile) {
  modalState.stdoutFile = stdoutFile || "";
  modalState.stderrFile = stderrFile || "";
  setLogTab("stdout");
  const modal = document.getElementById("log-modal");
  modal.classList.remove("hidden");
  fetchAndShowLog();
}

function closeLogModal() {
  document.getElementById("log-modal").classList.add("hidden");
}

async function fetchAndShowLog() {
  const logFileNode = document.getElementById("log-file");
  const contentNode = document.getElementById("log-content");
  const type = modalState.activeType;
  const file = type === "stderr" ? modalState.stderrFile : modalState.stdoutFile;
  if (!file) {
    logFileNode.textContent = "无日志文件";
    contentNode.textContent = "";
    return;
  }
  logFileNode.textContent = `${type}: ${file}`;
  contentNode.textContent = "加载中...";
  const query = new URLSearchParams({
    type,
    stdoutFile: modalState.stdoutFile,
    stderrFile: modalState.stderrFile,
    _t: String(Date.now()),
  });
  try {
    const atBottomBeforeUpdate =
      contentNode.scrollTop + contentNode.clientHeight >= contentNode.scrollHeight - 8;
    const res = await fetch(`/api/logs?${query.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      contentNode.textContent = data.message || "读取日志失败";
      return;
    }
    contentNode.textContent = data.content || "(empty)";
    if (atBottomBeforeUpdate) {
      contentNode.scrollTop = contentNode.scrollHeight;
    }
  } catch (_err) {
    contentNode.textContent = "读取日志失败，请稍后重试";
  }
}

function bindLogActions() {
  const logButtons = document.querySelectorAll(".log-btn");
  logButtons.forEach((button) => {
    button.onclick = () => openLogModal(button.dataset.stdoutFile || "", button.dataset.stderrFile || "");
  });
}

function bindModalActions() {
  document.getElementById("close-log-modal").onclick = closeLogModal;
  document.querySelector(".log-modal-mask").onclick = closeLogModal;
  document.getElementById("stdout-tab").onclick = async () => {
    setLogTab("stdout");
    await fetchAndShowLog();
  };
  document.getElementById("stderr-tab").onclick = async () => {
    setLogTab("stderr");
    await fetchAndShowLog();
  };
  const refreshLogBtn = document.getElementById("refresh-log-btn");
  refreshLogBtn.onclick = async () => {
    setButtonLoading(refreshLogBtn, true, "刷新中...");
    try {
      await withLoadingOverlay(() => fetchAndShowLog());
    } finally {
      setButtonLoading(refreshLogBtn, false);
    }
  };
}

function bindPageActions() {
  const refreshHistoryBtn = document.getElementById("refresh-history-btn");
  refreshHistoryBtn.onclick = async () => {
    setButtonLoading(refreshHistoryBtn, true, "刷新中...");
    try {
      await withLoadingOverlay(() => refreshHistory());
      toast("列表已刷新");
    } finally {
      setButtonLoading(refreshHistoryBtn, false);
    }
  };
}

const runButton = document.getElementById("run-script-btn");
runButton.onclick = () => runScript(runButton.dataset.scriptId, runButton);

bindLogActions();
bindModalActions();
bindPageActions();
refreshHistory().catch(() => {});
