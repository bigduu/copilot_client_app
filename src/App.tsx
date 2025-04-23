import "antd/dist/reset.css";
import "./App.css";
import SpotlightInput from "./components/SpotlightInput";
import { ChatProvider } from "./contexts/ChatContext";
import { MainLayout } from "./layouts/MainLayout";

function App() {
  return (
    <ChatProvider>
      <div style={{ position: "relative" }}>
        <MainLayout />
        <SpotlightInput />
      </div>
    </ChatProvider>
  );
}

export default App;
