/** Shared entry for standalone application pages (no React dependency). */
import { startVisitTracking } from "./tracking";

const root = document.querySelector<HTMLElement>("[data-analytics-app]");
if (root) {
  const updatePage = () => {
    const view = root.dataset.view || "home";
    root.dataset.analyticsPage = `app:${root.dataset.analyticsApp}:${view}`;
    root.dataset.analyticsTitle = document.title;
  };
  updatePage();
  new MutationObserver(updatePage).observe(root, { attributes: true, attributeFilter: ["data-view"] });
  // Page titles are often set immediately after the view attribute.
  const title = document.querySelector("title");
  if (title) new MutationObserver(updatePage).observe(title, { subtree: true, childList: true, characterData: true });
  startVisitTracking();
}
