import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { Input, Modal } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import "./SpotlightInput.css";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function SpotlightInput() {
  const [isVisible, setIsVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const shortcut = "CommandOrControl+K";

    register(shortcut, () => {
      setIsVisible((prev) => !prev);
      setSearchText("");
    }).catch(console.error);

    return () => {
      unregister(shortcut).catch(console.error);
    };
  }, []);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
  };

  const handleClose = () => {
    setIsVisible(false);
    setSearchText("");
  };

  const handleSendMessage = async () => {
    if (!searchText.trim() || isSending) return;

    try {
      setIsSending(true);
      await invoke("forward_message_to_main", { message: searchText.trim() });
      handleClose();
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Modal
      open={isVisible}
      onCancel={handleClose}
      footer={null}
      closable={false}
      centered
      width={600}
      className="spotlight-modal"
      styles={{ mask: { backdropFilter: "blur(10px)" } }}
    >
      <Input
        size="large"
        placeholder="Type a command..."
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={handleSearch}
        onKeyDown={handleKeyDown}
        autoFocus
        disabled={isSending}
      />
    </Modal>
  );
}
