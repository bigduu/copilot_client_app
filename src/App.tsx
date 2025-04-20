import React from "react";
import { MainLayout } from "./layouts/MainLayout";
import { ChatProvider } from "./contexts/ChatContext";
import "antd/dist/reset.css";
import "./App.css";

function App() {
  return (
    <ChatProvider>
      <MainLayout />
    </ChatProvider>
  );
}

export default App;
