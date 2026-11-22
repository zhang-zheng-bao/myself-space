import "./components/theme-veil.css";

export type VeilTheme = "original" | "ink" | "desk";
const labels: Record<VeilTheme, string> = { original: "原主题", ink: "染墨", desk: "3D 桌面" };
const KEY = "theme-veil";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 切换主题的过场：目标主题的底色从点击位置铺满屏幕，铺满后再执行切换。 */
export function coverThenSwitch(target: VeilTheme, origin: DOMRect | null, run: () => void, reload: boolean) {
  if (reducedMotion()) { run(); return; }
  document.querySelector(".theme-veil")?.remove();
  const veil = document.createElement("div");
  veil.className = "theme-veil";
  veil.dataset.to = target;
  veil.setAttribute("aria-hidden", "true");
  veil.style.setProperty("--veil-x", `${origin ? origin.left + origin.width / 2 : window.innerWidth / 2}px`);
  veil.style.setProperty("--veil-y", `${origin ? origin.top + origin.height / 2 : window.innerHeight / 2}px`);
  const label = document.createElement("span");
  label.textContent = labels[target];
  veil.append(label);
  document.body.append(veil);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (reload) {
      // 新页面的加载页接着用同一底色，载入完成后再淡出。
      try { sessionStorage.setItem(KEY, target); } catch {}
      run();
      return;
    }
    run();
    veil.classList.add("is-leaving");
    window.setTimeout(() => veil.remove(), 520);
  };
  veil.addEventListener("animationend", finish, { once: true });
  window.setTimeout(finish, 800);
}

/** 收起加载页：淡出后移除，和切换主题时铺开的底色衔接。 */
export function dismissBootLoader(animate = true) {
  const loader = document.getElementById("boot-loader");
  if (!loader) return;
  if (!animate || reducedMotion()) { loader.remove(); return; }
  loader.classList.add("is-leaving");
  window.setTimeout(() => loader.remove(), 620);
}
