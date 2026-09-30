import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {renderLanding} from "../render.mjs";

const template = await readFile(new URL("../index.html", import.meta.url), "utf8");
const source = JSON.parse(await readFile(new URL("../content/landing.json", import.meta.url), "utf8"));

test("rendered copy and embedded JSON cannot create executable HTML", () => {
  const content = structuredClone(source);
  content.hero.description = '</p><img src=x onerror="alert(1)">';
  content.request.namePlaceholder = '" autofocus onfocus="alert(2)';
  content.included.features[0].title = "</script><script>alert(3)</script>";
  const html = renderLanding(template, content, {production:true, origin:"https://fkuss.ru"});
  const markup = html.replace(/<script id="landing-content" type="application\/json">[\s\S]*?<\/script>/, "");
  assert.doesNotMatch(markup, /<img src=x/);
  assert.doesNotMatch(markup, /<script>alert/);
  assert.doesNotMatch(markup, /" autofocus onfocus=/);
  const embedded = /<script id="landing-content" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.equal(JSON.parse(embedded).hero.description, content.hero.description);
  assert.equal(JSON.parse(embedded).request.namePlaceholder, content.request.namePlaceholder);
});

test("renderer refuses executable links and asset paths outside the public assets", () => {
  const content = structuredClone(source);
  content.examples.items[0].url = "javascript:alert(1)";
  assert.throws(() => renderLanding(template, content), /Invalid public URL/);
  content.examples.items[0].url = source.examples.items[0].url;
  content.brand.logo = "../secrets/landing/admin.json";
  assert.throws(() => renderLanding(template, content), /Invalid public asset/);
});
