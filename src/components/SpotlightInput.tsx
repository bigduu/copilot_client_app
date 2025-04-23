import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import "./SpotlightInput.css";
import { useEffect, useState } from "react";

export default function SpotlightInput() {
  const [isVisible, setIsVisible] = useState(false);
  const [searchText, setSearchText] = useState("");

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

  if (!isVisible) return null;

  return (
    <div className="spotlight-container">
      <input
        type="text"
        className="spotlight-input"
        value={searchText}
        onChange={handleSearch}
        placeholder="Type a command..."
        autoFocus
      />
    </div>
  );
}
