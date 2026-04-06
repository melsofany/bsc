import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("error", (e) => {
  const src = e.filename ?? "";
  if (src.startsWith("chrome-extension://") || src.startsWith("moz-extension://")) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

window.addEventListener("unhandledrejection", (e) => {
  const stack = e.reason?.stack ?? "";
  if (stack.includes("chrome-extension://") || stack.includes("moz-extension://")) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

createRoot(document.getElementById("root")!).render(<App />);
