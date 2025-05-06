import React from "react";
import ReactDOM from "react-dom/client";
import SearchWindow from "./components/SearchWindow";
import { ConfigProvider, theme } from "antd";
import "antd/dist/reset.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 6,
        },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <SearchWindow />
    </ConfigProvider>
  </React.StrictMode>
);
