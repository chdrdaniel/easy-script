// Author: yuanxun.mei@gmail.com
async function refreshRunning() {
  const res = await fetch("/api/running");
  const data = await res.json();
  if (!data.ok) return;
  const count = document.getElementById("running-count");
  if (count) {
    count.textContent = String(data.running.length);
  }
}

setInterval(() => {
  refreshRunning().catch(() => {});
}, 4000);
