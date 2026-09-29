const statuses = [
  {value:"new", label:"Новая"},
  {value:"contacted", label:"Пообщались"},
  {value:"working", label:"Работаем"},
  {value:"completed", label:"Завершено"}
];
const icons = {
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.8.7 2 2 0 0 1 1.8 2.1Z"/>',
  message:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  external:'<path d="M15 3h6v6M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>'
};
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = icons[name];
  return node;
}
async function api(path, options = {}) {
  const response = await fetch(path, {credentials:"same-origin", cache:"no-store", ...options});
  const data = await response.json();
  if (response.status === 401 && !path.endsWith("/login")) {
    location.assign("/admin/login");
    throw new Error("Войдите снова, чтобы продолжить.");
  }
  if (!response.ok) throw new Error(data.error || "Не удалось выполнить действие. Попробуйте ещё раз.");
  return data;
}
function mutation(method, body) {
  return {method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)};
}

function startLogin() {
  const form = document.querySelector("#login-form");
  const button = document.querySelector("#login-submit");
  const error = document.querySelector("#login-error");
  let pending = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    button.disabled = true;
    button.textContent = "Входим…";
    error.hidden = true;
    form.setAttribute("aria-busy", "true");
    try {
      await api("/api/admin/login", mutation("POST", {login:document.querySelector("#login").value.trim(), password:document.querySelector("#password").value}));
      location.assign("/admin");
    } catch (reason) {
      error.textContent = reason.message === "Failed to fetch" ? "Не удалось войти. Проверьте соединение и попробуйте ещё раз." : reason.message;
      error.hidden = false;
    } finally {
      pending = false;
      button.disabled = false;
      button.textContent = "Войти";
      form.removeAttribute("aria-busy");
    }
  });
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {timeZone:"Europe/Moscow", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit"});
function formattedPhone(phone) {
  return phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 ($1) $2-$3-$4");
}
function leadCard(lead) {
  const item = element("li");
  const card = element("article", "lead-card");
  card.setAttribute("aria-labelledby", "lead-title-" + lead.id);
  const top = element("div", "lead-top");
  const time = element("time", "lead-date", dateFormatter.format(new Date(lead.createdAt)) + " · № " + lead.id);
  time.dateTime = lead.createdAt;
  const status = statuses.find(entry => entry.value === lead.status) || statuses[0];
  const badge = element("span", "status-pill status-" + status.value, status.label);
  top.append(time, badge);

  const overview = element("div", "lead-overview");
  const copy = element("div", "lead-copy");
  const title = element("h3", "lead-title", lead.restaurant || "Название не указано");
  title.id = "lead-title-" + lead.id;
  const phone = element("a", "lead-phone", formattedPhone(lead.phone));
  phone.href = "tel:" + lead.phone;
  const contactName = element("p", "lead-contact-name", lead.contactName ? "Контакт: " + lead.contactName : "Имя не указано");
  copy.append(title, contactName, phone);
  if (lead.menu) {
    const menu = element("a", "lead-menu", "Открыть меню");
    menu.href = lead.menu;
    menu.target = "_blank";
    menu.rel = "noopener noreferrer";
    menu.append(icon("external"));
    copy.append(menu);
  } else copy.append(element("span", "menu-missing", "Меню не прикреплено"));
  const contacts = element("div", "contact-actions");
  const call = element("a", "button");
  call.href = "tel:" + lead.phone;
  call.append(icon("phone"), element("span", "", "Позвонить"));
  const whatsapp = element("a", "button");
  whatsapp.href = "https://wa.me/" + lead.phone.replace(/\D/g, "");
  whatsapp.target = "_blank";
  whatsapp.rel = "noopener noreferrer";
  whatsapp.append(icon("message"), element("span", "", "WhatsApp"));
  contacts.append(call, whatsapp);
  overview.append(copy, contacts);
  const preview = element("p", "comment-preview", lead.comment);
  preview.hidden = !lead.comment;

  const details = element("details", "lead-details");
  details.append(element("summary", "", "Статус и комментарий"));
  const editor = element("form", "lead-editor");
  const statusLabel = element("label", "", "Статус");
  statusLabel.htmlFor = "status-" + lead.id;
  const select = element("select");
  select.id = statusLabel.htmlFor;
  select.name = "status";
  statuses.forEach(entry => {
    const option = element("option", "", entry.label);
    option.value = entry.value;
    select.append(option);
  });
  select.value = status.value;
  const commentLabel = element("label", "", "Комментарий");
  commentLabel.htmlFor = "comment-" + lead.id;
  const comment = element("textarea");
  comment.id = commentLabel.htmlFor;
  comment.name = "comment";
  comment.maxLength = 5000;
  comment.placeholder = "Что обсудили и о чём договорились";
  comment.value = lead.comment;
  const actions = element("div", "editor-actions");
  const save = element("button", "button primary", "Сохранить");
  save.type = "submit";
  const message = element("p", "save-message");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  actions.append(save, message);
  editor.append(statusLabel, select, commentLabel, comment, actions);
  details.append(editor);
  let pending = false;
  editor.addEventListener("input", () => { message.textContent = ""; });
  editor.addEventListener("submit", async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    save.disabled = true;
    save.textContent = "Сохраняем…";
    message.textContent = "";
    editor.setAttribute("aria-busy", "true");
    const newStatus = select.value;
    const newComment = comment.value.trim();
    select.disabled = true;
    comment.disabled = true;
    try {
      await api("/api/admin/leads/" + lead.id, mutation("PATCH", {status:newStatus, comment:newComment}));
      lead.status = newStatus;
      lead.comment = newComment;
      badge.textContent = statuses.find(entry => entry.value === newStatus).label;
      badge.className = "status-pill status-" + newStatus;
      preview.textContent = newComment;
      preview.hidden = !newComment;
      comment.value = newComment;
      message.className = "save-message";
      message.textContent = "Сохранено";
    } catch (reason) {
      message.className = "save-message error";
      message.textContent = reason.message === "Failed to fetch" ? "Не удалось сохранить. Попробуйте ещё раз." : reason.message;
    } finally {
      pending = false;
      save.disabled = false;
      select.disabled = false;
      comment.disabled = false;
      save.textContent = "Сохранить";
      editor.removeAttribute("aria-busy");
    }
  });
  card.append(top, overview, preview, details);
  item.append(card);
  return item;
}

function startAdmin() {
  const list = document.querySelector("#lead-list");
  const error = document.querySelector("#list-error");
  const count = document.querySelector("#lead-count");
  const navCount = document.querySelector("#nav-count");
  const empty = document.querySelector("#empty-state");
  const status = document.querySelector("#list-status");
  const refresh = document.querySelector("#refresh");
  const logout = document.querySelector("#logout");
  let pending = false;
  async function load() {
    if (pending) return;
    pending = true;
    refresh.disabled = true;
    error.hidden = true;
    status.textContent = "Загружаем заявки…";
    try {
      const {leads} = await api("/api/admin/leads");
      const fragment = document.createDocumentFragment();
      leads.forEach(lead => fragment.append(leadCard(lead)));
      list.replaceChildren(fragment);
      count.textContent = String(leads.length);
      navCount.textContent = String(leads.length);
      empty.hidden = leads.length > 0;
      status.textContent = "Сначала новые";
    } catch (reason) {
      status.textContent = "";
      error.textContent = reason.message === "Failed to fetch" ? "Не удалось загрузить заявки. Нажмите «Обновить»." : reason.message;
      error.hidden = false;
    } finally { pending = false; refresh.disabled = false; }
  }
  refresh.addEventListener("click", load);
  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await api("/api/admin/logout", mutation("POST", {}));
      location.assign("/admin/login");
    } catch {
      logout.disabled = false;
      error.textContent = "Не удалось выйти. Попробуйте ещё раз.";
      error.hidden = false;
    }
  });
  load();
}
if (document.querySelector("#login-form")) startLogin();
else startAdmin();
