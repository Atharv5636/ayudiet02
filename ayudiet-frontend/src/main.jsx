import React from "react";
import ReactDOM from "react-dom/client";
import AppBootstrap from "./AppBootstrap";
import { getFrontendEnvHealth } from "./utils/env";
import "./index.css";

const envHealth = getFrontendEnvHealth();

if (envHealth.warnings.length > 0) {
  envHealth.warnings.forEach((warning) => console.warn(`[ENV WARNING] ${warning}`));
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppBootstrap />
  </React.StrictMode>
);
