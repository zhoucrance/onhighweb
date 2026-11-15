// Interview practice API, served by the careers bot (FastAPI) at
// https://onhightech.co.zw/careers-bot/api/interview. Same domain as this site,
// so no CORS. In development, vite.config.js proxies /careers-bot to the bot.
const BASE = import.meta.env.VITE_INTERVIEW_API || "/careers-bot/api/interview";
const TOKEN_KEY = "onhigh_interview_token";

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: stays signed in for this page only */
  }
}

export class ApiError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("We could not reach the server. Check your connection and try again.", 0);
  }
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    if (response.status === 401) setToken("");
    const detail = data.detail;
    const message =
      (typeof detail === "string" && detail) ||
      (detail && detail.message) ||
      "Something went wrong. Please try again.";
    throw new ApiError(message, response.status, typeof detail === "object" ? detail : {});
  }
  return data;
}

export const interviewApi = {
  sectors: () => request("/sectors"),
  topics: ({ sector = "", q = "" } = {}) =>
    request(`/topics?sector=${encodeURIComponent(sector)}&q=${encodeURIComponent(q)}`),
  topic: (id) => request(`/topics/${encodeURIComponent(id)}`),
  me: () => request("/me"),
  sendCode: (phone) => request("/auth/code", { method: "POST", body: { phone } }),
  verifyCode: (phone, code) => request("/auth/verify", { method: "POST", body: { phone, code } }),
  pay: (body) => request("/pay", { method: "POST", body }),
  paymentStatus: (id) => request(`/pay/${encodeURIComponent(id)}`),
};
