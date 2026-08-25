import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

const instance = axios.create({ baseURL: API_URL });

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
};

export const scripts = {
  getById: (id) => instance.get(`/scripts/${id}`),
  getByProject: (projectId) => instance.get(`/scripts/project/${projectId}`),
  save: (id, content) => instance.put(`/scripts/${id}`, { content }),
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
  lessons: () => instance.get("/learn/lessons"),
  lesson: (id) => instance.get(`/learn/lessons/${id}`),
  // Graded by the craft linter, so the verdict is deterministic and free.
  submit: (id, content) => instance.post(`/learn/lessons/${id}/submit`, { content }),
  forRule: (rule) => instance.get(`/learn/for-rule/${rule}`),
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
