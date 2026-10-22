// Keep the report and all embedded full-resolution assets unchanged.
const report = document.createElement('div');
report.id = 'case-report';
while (document.body.firstChild) report.append(document.body.firstChild);
document.body.append(report);
report.querySelector('nav[aria-label="案例导航"]')?.remove();
const toolbar = document.createElement('nav');
toolbar.setAttribute('aria-label', '案例阅读控制');
toolbar.style.cssText = 'position:sticky;top:0;z-index:1000;display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:12px 24px;background:#fff;border-bottom:1px solid #ddd;font:14px system-ui;color:#222';
toolbar.innerHTML = '<a href="/?tab=cases" style="color:inherit">← 返回案例分析</a><label>阅读缩放 <select aria-label="阅读缩放"><option value="40">40%</option><option value="50">50%</option><option value="60" selected>60%</option><option value="80">80%</option><option value="100">100%</option></select></label>';
document.body.prepend(toolbar);
report.style.zoom = '0.6';
toolbar.querySelector('select').addEventListener('change', event => {
  report.style.zoom = String(Number(event.target.value) / 100);
});
