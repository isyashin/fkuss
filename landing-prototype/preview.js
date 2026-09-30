const workspace = document.querySelector("#workspace");
const desktop = document.querySelector("#desktop-view");
const mobile = document.querySelector("#mobile-view");
const panel = document.querySelector("#principles-panel");
const why = document.querySelector("#why-button");
function setView(view) {
  const mobileView = view === "mobile";
  workspace.classList.toggle("mobile", mobileView);
  desktop.setAttribute("aria-pressed", String(!mobileView));
  mobile.setAttribute("aria-pressed", String(mobileView));
  const url = new URL(location.href);
  url.searchParams.set("view", mobileView ? "mobile" : "desktop");
  history.replaceState(null, "", url);
}
desktop.addEventListener("click", () => setView("desktop"));
mobile.addEventListener("click", () => setView("mobile"));
setView(new URL(location.href).searchParams.get("view") || "desktop");
why.addEventListener("click", () => {
  panel.hidden = !panel.hidden;
  why.setAttribute("aria-expanded", String(!panel.hidden));
});
document.querySelector("#close-principles").addEventListener("click", () => {
  panel.hidden = true;
  why.setAttribute("aria-expanded", "false");
  why.focus();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") { panel.hidden = true; why.setAttribute("aria-expanded", "false"); }
});
fetch("content/landing.json").then(response => response.json()).then(content => {
  document.querySelectorAll("[data-preview]").forEach(node => {node.textContent = content.prototype[node.dataset.preview];});
  const items = document.querySelector("#principles-list");
  content.prototype.principleItems.forEach(item => {
    const li = document.createElement("li");
    const heading = document.createElement("h2");
    heading.textContent = item.title;
    const body = document.createElement("p");
    body.textContent = item.text;
    li.append(heading, body);
    items.append(li);
  });
  const source = document.querySelector("#principle-source");
  source.href = content.prototype.sourceUrl;
  source.textContent = content.prototype.sourceLabel;
});
