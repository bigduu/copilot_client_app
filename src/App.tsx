import { ConfigProvider, theme } from "antd";
import "./App.css";
import SpotlightInput from "./components/SpotlightInput";
import { ChatProvider } from "./contexts/ChatContext";
import { MainLayout } from "./layouts/MainLayout";

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 6,
        },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <ChatProvider>
        <div style={{ position: "relative" }}>
          <MainLayout />
          <SpotlightInput />
        </div>
      </ChatProvider>
    </ConfigProvider>
  );
}

export default App;
