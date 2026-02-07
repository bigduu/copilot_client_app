import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const SpotlightPage: React.FC = () => {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input when window opens
    inputRef.current?.focus();

    // Handle escape key to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSpotlight();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const closeSpotlight = async () => {
    try {
      await invoke("close_spotlight");
    } catch (e) {
      console.error("Failed to close spotlight:", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      await invoke("send_spotlight_message", { message: input.trim() });
      setInput("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#1a1a1a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "calc(100% - 40px)",
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Bodhi..."
          style={{
            width: "100%",
            padding: "14px 20px",
            fontSize: 16,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 8,
            background: "#2a2a2a",
            color: "#fff",
            outline: "none",
            boxSizing: "border-box",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
          autoFocus
        />
        <div
          style={{
            textAlign: "center",
            color: "rgba(255, 255, 255, 0.35)",
            fontSize: 11,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          Press Enter to send, Esc to close
        </div>
      </form>
    </div>
  );
};

export default SpotlightPage;
