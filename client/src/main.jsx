import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import store from "./redux/store";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import OfflineStatusSync from "./components/OfflineStatusSync";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <OfflineStatusSync />
      <App />
    </QueryClientProvider>
  </Provider>
);

reportWebVitals();

// Save the site on the phone so later visits open without spending data
// (see public/sw.js). Production builds only, so development stays live.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Files this visit fetched before the worker was running: hand them over
  // so the worker saves them too (they come from the browser's cache, no data).
  const handOverLoaded = () => {
    const worker = navigator.serviceWorker.controller;
    if (!worker) return;
    const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
    worker.postMessage({ type: "save-loaded", urls });
  };
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (navigator.serviceWorker.controller) handOverLoaded();
    navigator.serviceWorker.addEventListener("controllerchange", handOverLoaded);
  });
}
