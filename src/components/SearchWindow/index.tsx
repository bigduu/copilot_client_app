import { useState, useCallback } from "react";
import { Input, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

export default function SearchWindow() {
  const [searchText, setSearchText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleClose = useCallback(async () => {
    try {
      const window = await WebviewWindow.getByLabel("spotlight");
      if (window) {
        setSearchText("");
        await window.hide();
      }
    } catch (error) {
      console.error("Error closing window:", error);
    }
  }, []);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      handleClose();
    }

    if (e.key === "Enter" && searchText.trim() && !isSending) {
      try {
        setIsSending(true);
        // Invoke command to create new chat
        await invoke("forward_message_to_main", { message: searchText.trim() });
        handleClose();
      } catch (error) {
        console.error("Error sending message:", error);
      } finally {
        setIsSending(false);
      }
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  return (
    <div className="search-window-container">
      <div className="search-window">
        <Space
          direction="vertical"
          size="middle"
          style={{ width: "100%", padding: "16px" }}
        >
          <Input
            size="large"
            placeholder="Start a new chat..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoFocus={true}
            spellCheck={false}
            disabled={isSending}
          />
        </Space>
      </div>
    </div>
  );
}
