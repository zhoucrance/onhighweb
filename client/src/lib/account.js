// OnHighTech customer accounts (website), served by the careers bot under
// /careers-bot/api/account. Not the staff sign-in (that uses localStorage "token").
// The session token is shared with the interview API (same key), and sent to the
// bills service so payments are listed under the account.
import { useEffect, useState } from "react";
import { ApiError, getToken, setToken } from "./interviewApi";

const BASE = import.meta.env.VITE_ACCOUNT_API || "/careers-bot/api/account";
const ACCOUNT_KEY = "onhigh_account";
const EVENT = "onhigh-account";

export function getAccount() {
  try {
    return JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) || "null");
  } catch {
    return null;
  }
}

function saveAccount(account) {
  try {
    if (account) window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

async function post(path, body) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const token = getToken(); // a guest browser's id: its purchases move into the account
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("We could not reach the server. Check your connection and try again.", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.", response.status);
  }
  setToken(data.token);
  saveAccount(data.account);
  return data;
}

export const signUp = (fields) => post("/signup", fields);
export const signIn = (login, password) => post("/signin", { login, password });
export const googleSignIn = (credential) => post("/google", { credential });
export const resetPassword = (login, code, password) => post("/reset", { login, code, password });

/** Sends a reset code; answers the same whether or not the account exists. */
export async function forgotPassword(login) {
  let response;
  try {
    response = await fetch(`${BASE}/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login }),
    });
  } catch {
    throw new ApiError("We could not reach the server. Check your connection and try again.", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.detail || "Something went wrong. Please try again.", response.status);
  return data.message;
}

let configOnce = null;
export function accountConfig() {
  configOnce =
    configOnce ||
    fetch(`${BASE}/config`)
      .then((r) => (r.ok ? r.json() : { googleClientId: "" }))
      .catch(() => ({ googleClientId: "" }));
  return configOnce;
}

export function signOut() {
  setToken("");
  saveAccount(null);
}

/** Header value for other services (bills): the signed-in account's token, if any. */
export function authHeader() {
  const token = getAccount() ? getToken() : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useAccount() {
  const [account, setAccount] = useState(getAccount);
  useEffect(() => {
    const update = () => setAccount(getAccount());
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return account;
}

// Open the sign-in window from anywhere: openAccount("signin" | "signup", onDone)
export function openAccount(mode = "signin", onDone) {
  window.dispatchEvent(new CustomEvent("onhigh-account-open", { detail: { mode, onDone } }));
}

export const localPhone = (phone) => (phone && phone.startsWith("263") ? `0${phone.slice(3)}` : phone || "");
