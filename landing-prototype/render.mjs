const icons = {
  repeat:'<path d="M4 9a8 8 0 0 1 13-4l3 3"/><path d="M20 3v5h-5"/><path d="M20 15a8 8 0 0 1-13 4l-3-3"/><path d="M4 21v-5h5"/>',
  sync:'<path d="M4 9a8 8 0 0 1 13-4l3 3"/><path d="M20 3v5h-5"/><path d="M20 15a8 8 0 0 1-13 4l-3-3"/><path d="M4 21v-5h5"/>',
  phone:'<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10 5h4m-3 13h2"/>',
  bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  mobile:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-4 13 2 2 4-5"/>',
  photo:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="m8 5 1-3h6l1 3"/><circle cx="12" cy="13" r="4"/>',
  panel:'<rect x="2.5" y="3" width="19" height="18" rx="3"/><path d="M8 3v18m0-12h13"/><path d="M12 13h5m-5 4h3"/>',
  heart:'<path d="m12 21-7.7-7.8A5 5 0 0 1 12 7a5 5 0 0 1 7.7 6.2L12 21Z"/>',
  payment:'<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M3 9h18M6 15h4"/>'
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
}
function icon(name) {
  return '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true">' + (icons[name] || icons.bag) + '</svg>';
}
function publicLink(value) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid public URL");
  return escapeHtml(value);
}
function assetPath(value) {
  if (!/^assets\/[a-zA-Z0-9._-]+$/.test(value)) throw new Error("Invalid public asset");
  return escapeHtml(value);
}
function externalLink(href, label, className = "text-link", ariaLabel = label) {
  return '<a class="' + className + '" href="' + publicLink(href) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(ariaLabel) + '"><span>' + escapeHtml(label) + '</span><span aria-hidden="true">↗</span></a>';
}

export function renderLanding(template, content, {origin, production = false} = {}) {
  let html = template.replace(/(<([a-z][a-z0-9]*)\b[^>]*\bdata-text="([^"]+)"[^>]*>)[\s\S]*?(<\/\2>)/gi, (_, opening, tag, path, closing) => {
    const value = path.split(".").reduce((current, key) => current?.[key], content);
    if (typeof value !== "string") throw new Error("Missing landing text: " + path);
    return opening + escapeHtml(value) + closing;
  });
  const fill = (id, markup) => {
    const pattern = new RegExp('(<([a-z0-9]+)\\b[^>]*\\bid="' + id + '"[^>]*>)\\s*(</\\2>)', "i");
    if (!pattern.test(html)) throw new Error("Missing landing slot: " + id);
    html = html.replace(pattern, (_, opening, tag, closing) => opening + markup + closing);
  };
  html = html.replace(/(<a\b[^>]*\bdata-primary[^>]*>)\s*<\/a>/g, (_, opening) => opening + '<span class="button-label">' + escapeHtml(content.primaryAction) + '</span><span class="button-arrow" aria-hidden="true">↗</span></a>');
  html = html.replace(/(<img\b[^>]*\bdata-logo)([^>]*>)/g, (_, opening, remainder) => opening + ' src="' + assetPath(content.brand.logo) + '" decoding="async"' + remainder);
  fill("navigation", content.navigation.map(item => {
    if (!/^#[a-z-]+$/.test(item.href)) throw new Error("Invalid navigation link");
    return '<a href="' + item.href + '">' + escapeHtml(item.label) + '</a>';
  }).join(""));
  fill("hero-heading", content.hero.heading.map(item => '<span' + (item.accent ? ' class="accent"' : "") + '>' + escapeHtml(item.text) + '</span>').join(""));
  fill("hero-tags", content.hero.tags.map(item => '<li>' + escapeHtml(item) + '</li>').join(""));
  html = html.replace(/(<a\b[^>]*\bid="hero-preview")/, (_, opening) => opening + ' href="' + publicLink(content.hero.preview.url) + '" aria-label="' + escapeHtml(content.hero.preview.caption + " — " + content.examples.newTabLabel) + '"');
  html = html.replace(/(<img\b[^>]*\bid="hero-screenshot")/, (_, opening) => opening + ' src="' + assetPath(content.hero.preview.image) + '" alt="' + escapeHtml(content.hero.preview.alt) + '" decoding="async"');
  fill("examples-grid", content.examples.items.map(item => {
    const label = content.examples.action + ": " + item.name + " — " + content.examples.newTabLabel;
    return '<article class="example-card"><a class="example-preview" href="' + publicLink(item.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(label) + '"><div class="browser-bar"><span class="browser-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>' + escapeHtml(item.domain) + '</span></div><img src="' + assetPath(item.image) + '" alt="' + escapeHtml(item.alt) + '" loading="lazy" decoding="async" width="1265" height="712"></a><div class="example-info"><h3>' + escapeHtml(item.name) + '</h3><p>' + escapeHtml(item.description) + '</p>' + externalLink(item.url, content.examples.action, "text-link", label) + '</div></article>';
  }).join(""));
  fill("scenario-grid", content.value.scenarios.map(item => '<article class="scenario-card"><div class="scenario-icon">' + icon(item.icon) + '</div><p class="scenario-label">' + escapeHtml(item.label) + '</p><h3>' + escapeHtml(item.title) + '</h3><p>' + escapeHtml(item.body) + '</p><p class="scenario-footnote"><span>↗</span><span>' + escapeHtml(item.footnote) + '</span></p></article>').join(""));
  fill("features-grid", content.included.features.map(item => '<article class="feature"><div class="feature-icon">' + icon(item.icon) + '</div><h3>' + escapeHtml(item.title) + '</h3><p>' + escapeHtml(item.body) + '</p></article>').join(""));
  html = html.replace('<span class="payment-icon" aria-hidden="true"></span>', '<span class="payment-icon" aria-hidden="true">' + icon("payment") + '</span>');
  fill("research-grid", content.research.items.map(item => '<article class="research-card"><p class="research-value">' + escapeHtml(item.value) + '</p><p class="research-label">' + escapeHtml(item.label) + '</p><p class="research-detail">' + escapeHtml(item.note) + '</p>' + externalLink(item.url, item.source, "source-link") + '</article>').join(""));
  fill("launch-grid", content.launch.items.map((item, index) => '<li class="launch-step"><span class="step-number">' + String(index + 1).padStart(2, "0") + '</span><h3>' + escapeHtml(item.title) + '</h3><p>' + escapeHtml(item.body) + '</p></li>').join(""));
  fill("reassurance-list", content.request.reassurance.map(item => '<li>' + escapeHtml(item) + '</li>').join(""));
  for (const [id, placeholder] of [["contact-name", content.request.namePlaceholder], ["phone", content.request.phonePlaceholder], ["restaurant", content.request.restaurantPlaceholder], ["menu", content.request.menuPlaceholder]]) {
    html = html.replace(new RegExp('(<input\\b[^>]*\\bid="' + id + '")'), (_, opening) => opening + ' placeholder="' + escapeHtml(placeholder) + '"');
  }
  const canonical = new URL("/", origin || content.meta.canonicalUrl).href;
  const imageUrl = new URL(content.brand.logo, canonical).href;
  html = html.replace(/<title>[\s\S]*?<\/title>/, "<title>" + escapeHtml(content.meta.title) + "</title>");
  html = html.replace('<meta name="description" content="">', '<meta name="description" content="' + escapeHtml(content.meta.description) + '">');
  html = html.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="' + (production ? "index, follow" : "noindex, nofollow") + '">');
  const metadata = '<link rel="canonical" href="' + escapeHtml(canonical) + '">\n<meta property="og:type" content="website">\n<meta property="og:locale" content="ru_RU">\n<meta property="og:title" content="' + escapeHtml(content.meta.title) + '">\n<meta property="og:description" content="' + escapeHtml(content.meta.description) + '">\n<meta property="og:url" content="' + escapeHtml(canonical) + '">\n<meta property="og:image" content="' + escapeHtml(imageUrl) + '">\n<meta property="og:image:width" content="2172">\n<meta property="og:image:height" content="724">\n<meta name="twitter:card" content="summary">\n';
  html = html.replace("</head>", metadata + "</head>");
  const serialized = JSON.stringify(content).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  html = html.replace("</body>", '<script id="landing-content" type="application/json">' + serialized + '</script>\n</body>');
  return html;
}
