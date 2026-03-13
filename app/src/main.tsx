import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable native browser context menu globally (Tauri desktop app).
// Radix ContextMenu components use preventDefault internally, so they
// still work — this only blocks the OS-native fallback menu.
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
