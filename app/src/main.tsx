import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import "./index.css";

// Disable native browser context menu globally (Tauri desktop app).
// Radix ContextMenu components use preventDefault internally, so they
// still work — this only blocks the OS-native fallback menu.
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Surface unhandled errors/rejections so blank screens are debuggable
window.addEventListener("error", (e) => {
  console.error("[machete] Unhandled error:", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[machete] Unhandled rejection:", e.reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
