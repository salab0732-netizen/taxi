import React from "react";
import ReactDOM from "react-dom/client";
import "./ui/theme.css";
import "./ui/neon.css";
import { getTheme, applyTheme } from "./ui/kit.jsx";
applyTheme(getTheme());
import { installPrintTokens } from "./printToken.js";
installPrintTokens();
import { installEnvRibbon } from "./envRibbon.js";
installEnvRibbon();
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
