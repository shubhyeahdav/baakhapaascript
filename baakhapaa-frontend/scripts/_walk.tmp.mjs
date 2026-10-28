import { chromium } from "playwright";
const API = "http://localhost:8000", APP = "http://localhost:3000", out = process.argv[2];
const j = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t}`); return JSON.parse(t);
};
const email = `walk${Date.now()}@example.com`, password = "Walk-through-2026!";
await j("POST", "/auth/register", { email, password, name: "Walk" });
const { token } = await j("POST", "/auth/login", { email, password });
await j("PUT", "/auth/preferences", { onboarded: true }, token);
const proj = await j("POST", "/projects/", { title: "Chiya Break", genre: "Comedy", tone: "Wry", language: "English",
  duration_minutes: 1, format: "short_form", duration_seconds: 45, hook_type: "question", short_form_category: "storytime", target_audience: "Youth" }, token);
const script = await j("GET", `/scripts/project/${proj.id}`, null, token);
const draft = "Why does nobody finish a Nepali web series?\nI watched forty of them.\n\nThe writing is often quite weak. The acting is often quite poor. The budget is always far too small. The audience is always quite tired.\n";
await j("PUT", `/scripts/${script.id}`, { content: draft }, token);
await j("POST", `/shorts/${script.id}/outliers`, { url: "https://www.youtube.com/shorts/abc123XYZ", views: 2000000, channel_median_views: 100000,
  transcript: "0:00\nWhy does nobody finish it?\n0:03\nI watched forty of them, every one.\n0:06\nBut the problem is not the writing.\n0:10\nIt is the first ninety seconds." }, token);
const b = await chromium.launch();
for (const [name, w, h] of [["short-phone", 375, 900], ["short-desk", 1280, 860]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((t) => localStorage.setItem("token", t), token);
  const p = await ctx.newPage();
  await p.goto(`${APP}/projects/${proj.id}/editor`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  const meter = await p.locator('[data-testid="rhythm-meter"]').count();
  const panel = await p.locator('[data-testid="shorts-panel"]').count();
  console.log(name, "scrollWidth", sw, "meter", meter, "panel", panel);
  await p.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
}
await b.close();
console.log(JSON.stringify({ token, project: proj.id, script: script.id }));
