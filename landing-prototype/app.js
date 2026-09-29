function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function start() {
  const content = JSON.parse(document.querySelector("#landing-content").textContent);
  const contactName = document.querySelector("#contact-name");
  const phone = document.querySelector("#phone");
  const menu = document.querySelector("#menu");
  const restaurant = document.querySelector("#restaurant");
  contactName.placeholder = content.request.namePlaceholder;
  phone.placeholder = content.request.phonePlaceholder;
  menu.placeholder = content.request.menuPlaceholder;
  restaurant.placeholder = content.request.restaurantPlaceholder;
  const form = document.querySelector("#request-form");
  const confirmation = document.querySelector("#confirmation");
  const closeConfirmation = document.querySelector("#close-confirmation");
  const submitButton = form.querySelector('[type="submit"]');
  const submitLabel = submitButton.querySelector('[data-text="request.submit"]');
  const submitError = document.querySelector("#submit-error");
  submitButton.disabled = false;
  let pending = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (pending) return;
    submitError.hidden = true;
    const nameValid = contactName.value.trim().length <= 120 && !/[\u0000-\u001f]/.test(contactName.value);
    const digits = phone.value.replace(/\D/g, "");
    const phoneValid = /^[+()\d\s.-]+$/.test(phone.value.trim()) && /^[78]\d{10}$/.test(digits);
    let menuValid = true;
    if (menu.value.trim()) {
      try {
        const url = new URL(menu.value.trim());
        menuValid = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
      }
      catch { menuValid = false; }
    }
    const phoneError = document.querySelector("#phone-error");
    const nameError = document.querySelector("#contact-name-error");
    const menuError = document.querySelector("#menu-error");
    phoneError.textContent = content.request.phoneError;
    nameError.textContent = content.request.nameError;
    menuError.textContent = content.request.linkError;
    phoneError.hidden = phoneValid;
    nameError.hidden = nameValid;
    menuError.hidden = menuValid;
    phone.setAttribute("aria-invalid", String(!phoneValid));
    contactName.setAttribute("aria-invalid", String(!nameValid));
    menu.setAttribute("aria-invalid", String(!menuValid));
    if (!nameValid) { contactName.focus(); return; }
    if (!phoneValid) { phone.focus(); return; }
    if (!menuValid) { menu.closest("details").open = true; menu.focus(); return; }
    pending = true;
    submitButton.disabled = true;
    submitLabel.textContent = content.request.pending;
    form.setAttribute("aria-busy", "true");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({contactName: contactName.value.trim(), phone: phone.value.trim(), restaurant: restaurant.value.trim(), menu: menu.value.trim(), website: document.querySelector("#website").value})
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.fields?.phone) { phoneError.hidden = false; phone.setAttribute("aria-invalid", "true"); }
        if (result.fields?.contactName) { nameError.hidden = false; contactName.setAttribute("aria-invalid", "true"); }
        if (result.fields?.menu) { menu.closest("details").open = true; menuError.hidden = false; menu.setAttribute("aria-invalid", "true"); }
        throw new Error(response.status === 429 ? content.request.rateError : content.request.sendError);
      }
      form.reset();
      form.querySelector("details").open = false;
      confirmation.showModal();
      updateSticky();
    } catch (error) {
      submitError.textContent = error.message === content.request.rateError ? content.request.rateError : content.request.sendError;
      submitError.hidden = false;
    } finally {
      pending = false;
      submitButton.disabled = false;
      submitLabel.textContent = content.request.submit;
      form.removeAttribute("aria-busy");
    }
  });
  closeConfirmation.addEventListener("click", () => confirmation.close());
  confirmation.addEventListener("click", event => {
    if (event.target === confirmation) {
      const rect = confirmation.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) confirmation.close();
    }
  });
  document.querySelectorAll('a[href="#request-form"]').forEach(link => link.addEventListener("click", () => {
    requestAnimationFrame(() => phone.focus({preventScroll: true}));
  }));
  const mobileAction = document.querySelector("#mobile-action");
  let heroVisible = true;
  let requestVisible = false;
  let footerVisible = false;
  const updateSticky = () => {
    mobileAction.hidden = heroVisible || requestVisible || footerVisible || confirmation.open;
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target.matches(".hero")) heroVisible = entry.isIntersecting;
      if (entry.target.matches(".request")) requestVisible = entry.isIntersecting;
      if (entry.target.matches(".site-footer")) footerVisible = entry.isIntersecting;
    });
    updateSticky();
  }, {rootMargin:"-83px 0px 0px 0px", threshold:0});
  observer.observe(document.querySelector(".hero"));
  observer.observe(document.querySelector(".request"));
  observer.observe(document.querySelector(".site-footer"));
  confirmation.addEventListener("close", updateSticky);
  if (location.hash) {
    requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({block: "start", behavior: "instant"}));
  }
}

start().catch(() => {
  const note = element("p", "noscript-note", "Не удалось загрузить страницу. Обновите её и попробуйте ещё раз.");
  note.setAttribute("role", "alert");
  document.querySelector("main").prepend(note);
});
