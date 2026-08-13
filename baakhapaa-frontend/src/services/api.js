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
  setPreferences: (prefs) => instance.put("/auth/preferences", prefs),
};

export const projects = {
  getAll: () => instance.get("/projects/"),
  getById: (id) => instance.get(`/projects/${id}`),
  create: (data) => instance.post("/projects/", data),
  delete: (id) => instance.delete(`/projects/${id}`),
};

export const scripts = {
  getById: (id) => instance.get(`/scripts/${id}`),
  getByProject: (projectId) => instance.get(`/scripts/project/${projectId}`),
  save: (id, content) => instance.put(`/scripts/${id}`, { content }),
  finalize: (id) => instance.post(`/scripts/${id}/finalize`),
  generateStructure: (data, projectId) =>
    instance.post(`/scripts/generate-structure?project_id=${projectId}`, data),
  addScene: (data) => instance.post("/scripts/add-scene", data),
  recommendations: (data) => instance.post("/scripts/recommendations", data),
  generateScene: (data) => instance.post("/scripts/generate-scene", data),
  improve: (data) => instance.post("/scripts/improve", data),
  suggest: (data) => instance.post("/scripts/suggest", data),
};

export const storyboard = {
  generate: (scriptId) => instance.post(`/storyboard/generate/${scriptId}`),
  getAll: (scriptId) => instance.get(`/storyboard/${scriptId}`),
};

export const versions = {
  getAll: (scriptId) => instance.get(`/versions/${scriptId}`),
  restore: (versionId) => instance.post(`/versions/${versionId}/restore`),
};

export const comments = {
  getAll: (scriptId) => instance.get(`/collaboration/comments/${scriptId}`),
  add: (scriptId, content, lineNumber) =>
    instance.post("/collaboration/comments", {
      script_id: scriptId, content, line_number: lineNumber,
    }),
  remove: (commentId) => instance.delete(`/collaboration/comments/${commentId}`),
};

export const subscription = {
  checkout: (tier) => instance.post("/subscription/checkout", { tier }),
};

export const exportApi = {
  pdf: (id) => instance.get(`/export/script/pdf/${id}`, { responseType: "blob" }),
  word: (id) => instance.get(`/export/script/word/${id}`, { responseType: "blob" }),
  package: (id) => instance.get(`/export/package/${id}`, { responseType: "blob" }),
};

export default instance;
