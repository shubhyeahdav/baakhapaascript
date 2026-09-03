import axios from "axios";

// Vite exposes env through import.meta.env and requires the VITE_ prefix.
// REACT_APP_API_URL is still read so an existing .env keeps working rather
// than silently falling back to localhost against a deployed backend.
// Optional-chained: `import.meta.env` is injected by Vite and is absent when
// this module is loaded by anything else, and an undefined lookup there takes
// down every page that imports the API client.
const API_URL =
  import.meta.env?.VITE_API_URL ||
  import.meta.env?.REACT_APP_API_URL ||
  "http://localhost:8000";

const instance = axios.create({ baseURL: API_URL });

/**
 * Read a Server-Sent Events response, calling `onText` with each piece.
 *
 * axios buffers a whole response before resolving, which is the exact
 * behaviour streaming exists to remove — so this drops to fetch and reads the
 * body as it arrives.
 *
 * The buffering across reads is not optional. A network chunk has no
 * relationship to an SSE event boundary: one read can end halfway through a
 * `data:` line, and parsing that as-is throws on JSON and silently loses the
 * piece. Everything up to the last complete blank-line separator is parsed,
 * and the remainder is carried into the next read.
 *
 * Returns the full text, so a caller that only wants the finished answer does
 * not have to accumulate it a second time.
 */
export async function streamSSE(path, body, onText) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Tier and auth failures still arrive as a normal status, because they are
    // decided before the first byte of the stream.
    const err = new Error("stream failed");
    err.response = { status: res.status, data: await res.json().catch(() => ({})) };
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop();          // last piece may be incomplete

    for (const block of events) {
      if (!block.startsWith("data: ")) continue;
      const payload = JSON.parse(block.slice(6));
      if (payload.error) {
        const err = new Error(payload.error);
        err.response = { data: { detail: payload.error } };
        throw err;
      }
      if (payload.text) {
        full += payload.text;
        onText(full);
      }
    }
  }
  return full;
}


instance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

instance.interceptors.response.use(
  (res) => res,
  (err) => {
    // Session expiry → back to login. Skip auth endpoints themselves, otherwise
    // a failed login reloads the page and wipes the error message.
    const isAuthCall = err.config?.url?.startsWith("/auth/");
    if (err.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (email, password) => instance.post("/auth/login", { email, password }),
  register: (email, password, name) => instance.post("/auth/register", { email, password, name }),
  getMe: () => instance.get("/auth/me"),
  // Which sign-in methods this deployment can actually offer, asked before
  // the page draws its buttons — the same contract as subscription.providers.
  providers: () => instance.get("/auth/providers"),
  // The ID token minted by Google Identity Services in the browser. Verified
  // server-side; nothing in it is trusted here.
  google: (credential) => instance.post("/auth/google", { credential }),
  // Erasure. Every project, draft, snapshot and board this account owns.
  // The email is retyped as confirmation because there is no undo.
  deleteAccount: (confirmEmail) =>
    instance.delete("/auth/me", { params: { confirm_email: confirmEmail } }),
  setPreferences: (prefs) => instance.put("/auth/preferences", prefs),
};

export const projects = {
  getAll: () => instance.get("/projects/"),
  getById: (id) => instance.get(`/projects/${id}`),
  create: (data) => instance.post("/projects/", data),
  delete: (id) => instance.delete(`/projects/${id}`),
  // FR12 roles. Per project, not global: a person is usually a writer on their
  // own work and a reader on someone else's, which one global role cannot say.
  members: (id) => instance.get(`/projects/${id}/members`),
  addMember: (id, email, role) => instance.post(`/projects/${id}/members`, { email, role }),
  setMemberRole: (id, userId, role) =>
    instance.put(`/projects/${id}/members/${userId}`, { role }),
  removeMember: (id, userId) => instance.delete(`/projects/${id}/members/${userId}`),
  // Invitations to people who have not registered yet. No email is sent — the
  // inviter passes the link on themselves, which in this market is far more
  // likely to be WhatsApp than mail.
  invites: (id) => instance.get(`/projects/${id}/invites`),
  revokeInvite: (id, inviteId) => instance.delete(`/projects/${id}/invites/${inviteId}`),
};

export const scripts = {
  getById: (id) => instance.get(`/scripts/${id}`),
  getByProject: (projectId) => instance.get(`/scripts/project/${projectId}`),
  save: (id, content) => instance.put(`/scripts/${id}`, { content }),
  setActDurations: (id, durations) => instance.put(`/scripts/${id}/acts`, { durations }),
  cast: (id) => instance.get(`/scripts/${id}/cast`),
  // Bring in an existing screenplay: .fdx, Fountain, plain text or PDF. The
  // server snapshots the current draft before overwriting it.
  importFile: (id, file, replace = true) => {
    const body = new FormData();
    body.append("file", file);
    return instance.post(`/scripts/${id}/import?replace=${replace}`, body);
  },
  // Story bible — character sheets, logline, theme, locations.
  bible: (id) => instance.get(`/scripts/${id}/bible`),
  saveBible: (id, bible) => instance.put(`/scripts/${id}/bible`, bible),
  finalize: (id) => instance.post(`/scripts/${id}/finalize`),
  // Proposal FR07: timing, character-name consistency and act balance.
  // Deterministic and free, so it can run before every finalize.
  review: (id) => instance.get(`/scripts/${id}/review`),
  // The reader's report: premise, runtime, structure, craft and shape in one
  // document. Free on every tier — every number in it is measured, not generated.
  coverage: (id) => instance.get(`/scripts/${id}/coverage`),
  // Who has opened, exported or replaced this script. Admin only — a log of
  // who read a draft is itself sensitive.
  accessLog: (id) => instance.get(`/scripts/${id}/access`),
  generateStructure: (data, projectId) =>
    instance.post(`/scripts/generate-structure?project_id=${projectId}`, data),
  addScene: (data) => instance.post("/scripts/add-scene", data),
  recommendations: (data) => instance.post("/scripts/recommendations", data),
  // Deterministic craft diagnostics — every tier, no AI cost, works on a
  // partial draft. Returns flags with line numbers plus by_craft_level.
  lint: (data) => instance.post("/scripts/lint", data),
  // Shape comparison against the analysed corpus. Returns {ready:false} with
  // progress until the draft is big enough to say anything honest about.
  benchmark: (data) => instance.post("/scripts/benchmark", data),
  generateScene: (data) => instance.post("/scripts/generate-scene", data),
  improve: (data) => instance.post("/scripts/improve", data),
  suggest: (data) => instance.post("/scripts/suggest", data),
};

export const storyboard = {
  generate: (scriptId) => instance.post(`/storyboard/generate/${scriptId}`),
  getAll: (scriptId) => instance.get(`/storyboard/${scriptId}`),
  // FR09 frame controls. The routes existed from the first storyboard commit
  // and nothing ever called them, so shot type, camera notes and frame order
  // were fixed at whatever generation happened to pick.
  shotTypes: () => instance.get("/storyboard/shot-types"),
  update: (frameId, patch) => instance.put(`/storyboard/${frameId}`, patch),
  regenerate: (frameId, { shotType, description } = {}) =>
    instance.post(`/storyboard/regenerate/${frameId}`, null, {
      params: { shot_type: shotType || "", description: description || "" },
    }),
};

export const versions = {
  getAll: (scriptId) => instance.get(`/versions/${scriptId}`),
  restore: (versionId) => instance.post(`/versions/${versionId}/restore`),
  // FR11's other half. The route existed from the first version commit and the
  // UI only ever restored, so "diff view between any two versions" was a promise
  // with no way to reach it.
  diff: (olderId, newerId) =>
    instance.get("/versions/diff/compare", {
      params: { version_id_a: olderId, version_id_b: newerId },
    }),
};

export const comments = {
  getAll: (scriptId) => instance.get(`/collaboration/comments/${scriptId}`),
  add: (scriptId, content, lineNumber) =>
    instance.post("/collaboration/comments", {
      script_id: scriptId, content, line_number: lineNumber,
    }),
  remove: (commentId) => instance.delete(`/collaboration/comments/${commentId}`),
};

export const learn = {
  // The course is translated too, not just the chrome around it. `lang` is
  // passed explicitly rather than read from a header so a caller can ask for a
  // specific language — the editor's "learn this" link wants the language the
  // writer is reading the app in, which is not necessarily the browser's.
  lessons: (lang = "en") => instance.get("/learn/lessons", { params: { lang } }),
  lesson: (id, lang = "en") => instance.get(`/learn/lessons/${id}`, { params: { lang } }),
  // Graded by the craft linter, so the verdict is deterministic and free.
  submit: (id, content) => instance.post(`/learn/lessons/${id}/submit`, { content }),
  forRule: (rule, lang = "en") =>
    instance.get(`/learn/for-rule/${rule}`, { params: { lang } }),
  // The escalation path from the craft panel. Technique names carry commas and
  // apostrophes, so the value is encoded rather than interpolated raw.
  forTechnique: (technique, lang = "en") =>
    instance.get(`/learn/for-technique/${encodeURIComponent(technique)}`,
                 { params: { lang } }),
};

export const subscription = {
  // Which gateways this deployment can actually take money through. Stripe
  // declines most Nepali cards, so the pricing page cannot assume one.
  providers: () => instance.get("/subscription/providers"),
  checkout: (tier, provider) => instance.post("/subscription/checkout", { tier, provider }),
  // `params` is whatever the gateway put on the return URL. The server treats
  // it as a lookup key and confirms the payment with the gateway itself.
  verify: (provider, params) => instance.post("/subscription/verify", { provider, params }),
  payments: () => instance.get("/subscription/payments"),
};

export const exportApi = {
  pdf: (id) => instance.get(`/export/script/pdf/${id}`, { responseType: "blob" }),
  word: (id) => instance.get(`/export/script/word/${id}`, { responseType: "blob" }),
  // Final Draft. The format every other screenwriting tool reads, deliberately
  // free — and unreachable from the UI since the day it was written, which made
  // "hand it to a production team" a PDF-only promise.
  fdx: (id) => instance.get(`/export/script/fdx/${id}`, { responseType: "blob" }),
  package: (id) => instance.get(`/export/package/${id}`, { responseType: "blob" }),
};

export default instance;
