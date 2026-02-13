# Settings Storage JSON Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the SQLite app settings store with JSON files under `~/.bamboo`, update Tauri commands and the copilot client to read/write JSON, and add keyword masking UI helpers.

**Architecture:** Introduce JSON read/write helpers for `~/.bamboo/config.json` and `~/.bamboo/keyword_masking.json`. Tauri commands and `claude_binary` will call these helpers instead of SQLite; the copilot client will load masking config from the new JSON file. UI enhancements live in the settings tab and do not change backend APIs.

**Tech Stack:** Rust (Tauri, serde_json), TypeScript/React (Ant Design), Vitest.

### Task 1: Add Bamboo JSON settings helpers

**Files:**
- Create: `src-tauri/src/bamboo_settings.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/bamboo_settings.rs`

**Step 1: Write the failing test**

```rust
#[test]
fn updates_claude_settings_without_clobbering() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = dir.path().join("config.json");
    std::fs::write(&path, r#"{\"api_base\":\"https://example.com\"}"#).unwrap();

    let updated = update_claude_config(&path, Some("/bin/claude".to_string()), Some("system".to_string())).unwrap();
    let api_base = updated.get("api_base").and_then(|v| v.as_str()).unwrap();
    let claude = updated.get("claude").unwrap();

    assert_eq!(api_base, "https://example.com");
    assert_eq!(claude.get("binary_path").and_then(|v| v.as_str()).unwrap(), "/bin/claude");
    assert_eq!(claude.get("installation_preference").and_then(|v| v.as_str()).unwrap(), "system");
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test --package copilot_chat bamboo_settings::updates_claude_settings_without_clobbering`
Expected: FAIL with missing module or function.

**Step 3: Write minimal implementation**

```rust
pub fn load_config_json(path: &Path) -> Result<serde_json::Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config.json: {e}"))
}

pub fn write_config_json(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub fn update_claude_config(
    path: &Path,
    binary_path: Option<String>,
    installation_preference: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut root = load_config_json(path)?;
    let root_obj = root.as_object_mut().ok_or("config.json must be a JSON object")?;
    let claude_entry = root_obj.entry("claude").or_insert_with(|| serde_json::json!({}));
    let claude_obj = claude_entry.as_object_mut().ok_or("claude must be a JSON object")?;

    if let Some(path) = binary_path {
        claude_obj.insert("binary_path".to_string(), serde_json::Value::String(path));
    }
    if let Some(pref) = installation_preference {
        claude_obj.insert("installation_preference".to_string(), serde_json::Value::String(pref));
    }

    Ok(root)
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test --package copilot_chat bamboo_settings::updates_claude_settings_without_clobbering`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/bamboo_settings.rs src-tauri/src/lib.rs
git commit -m "feat: add bamboo settings json helpers"
```

### Task 2: Switch Claude binary settings to JSON

**Files:**
- Modify: `src-tauri/src/claude_binary.rs`
- Modify: `src-tauri/src/command/claude_code.rs`
- Test: `src-tauri/src/command/claude_code.rs`

**Step 1: Write the failing test**

```rust
#[test]
fn get_claude_binary_path_reads_from_config_json() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = dir.path().join("config.json");
    std::fs::write(&path, r#"{\"claude\":{\"binary_path\":\"/bin/claude\"}}"#).unwrap();

    let loaded = read_claude_binary_path(&path).unwrap();
    assert_eq!(loaded, Some("/bin/claude".to_string()));
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test --package copilot_chat get_claude_binary_path_reads_from_config_json`
Expected: FAIL

**Step 3: Write minimal implementation**

```rust
pub fn read_claude_binary_path(path: &Path) -> Result<Option<String>, String> {
    let root = load_config_json(path)?;
    Ok(root
        .get("claude")
        .and_then(|v| v.get("binary_path"))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string()))
}
```

Update `set_claude_binary_path` to use `update_claude_config` + `write_config_json`, and update `claude_binary::find_claude_binary` to read `claude.binary_path` and `claude.installation_preference` from `config.json`.

**Step 4: Run test to verify it passes**

Run: `cargo test --package copilot_chat get_claude_binary_path_reads_from_config_json`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/claude_binary.rs src-tauri/src/command/claude_code.rs
 git commit -m "feat: read claude binary settings from bamboo config"
```

### Task 3: Switch keyword masking storage to JSON

**Files:**
- Modify: `src-tauri/src/command/keyword_masking.rs`
- Modify: `crates/copilot_client/src/api/client.rs`
- Test: `src-tauri/src/command/keyword_masking.rs`

**Step 1: Write the failing test**

```rust
#[test]
fn load_keyword_masking_defaults_when_missing() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = dir.path().join("keyword_masking.json");

    let config = load_keyword_masking_config(&path).unwrap();
    assert!(config.entries.is_empty());
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test --package copilot_chat load_keyword_masking_defaults_when_missing`
Expected: FAIL

**Step 3: Write minimal implementation**

```rust
pub fn load_keyword_masking_config(path: &Path) -> Result<KeywordMaskingConfig, String> {
    if !path.exists() {
        return Ok(KeywordMaskingConfig::default());
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse keyword_masking.json: {e}"))
}

pub fn save_keyword_masking_config(path: &Path, config: &KeywordMaskingConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}
```

Update the Tauri commands to use these helpers and `~/.bamboo/keyword_masking.json`, and update the copilot client to load from the same path, falling back to default on errors.

**Step 4: Run test to verify it passes**

Run: `cargo test --package copilot_chat load_keyword_masking_defaults_when_missing`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/command/keyword_masking.rs crates/copilot_client/src/api/client.rs
 git commit -m "feat: persist keyword masking config to json"
```

### Task 4: Update keyword masking UI helpers

**Files:**
- Modify: `src/pages/SettingsPage/components/SystemSettingsPage/SystemSettingsKeywordMaskingTab.tsx`
- Test: `src/pages/SettingsPage/components/SystemSettingsPage/__tests__/SystemSettingsKeywordMaskingTab.test.tsx`

**Step 1: Write the failing test**

```tsx
it("applies example selection to pattern and match type", async () => {
  render(<SystemSettingsKeywordMaskingTab />)
  fireEvent.click(screen.getByText("Add Keyword"))
  fireEvent.mouseDown(screen.getByLabelText("Examples"))
  fireEvent.click(screen.getByText("Mask GitHub tokens"))
  expect(screen.getByPlaceholderText("Enter pattern to match")).toHaveValue("ghp_[A-Za-z0-9]+")
  expect(screen.getByText("Regex Pattern")).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- SystemSettingsKeywordMaskingTab`
Expected: FAIL with missing dropdown/label.

**Step 3: Write minimal implementation**

Add:
- Example dropdown options with label + pattern + match type.
- On selection, update `editPattern` and `editMatchType`.
- Add a sample input and masked preview output using a small helper that applies the same rules (exact replace and regex replace; show a validation error on invalid regex).

**Step 4: Run test to verify it passes**

Run: `npm run test -- SystemSettingsKeywordMaskingTab`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/SettingsPage/components/SystemSettingsPage/SystemSettingsKeywordMaskingTab.tsx
 git add src/pages/SettingsPage/components/SystemSettingsPage/__tests__/SystemSettingsKeywordMaskingTab.test.tsx
 git commit -m "feat: add keyword masking examples and preview"
```

### Task 5: Remove SQLite dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `crates/copilot_client/Cargo.toml`
- Modify: `Cargo.lock`

**Step 1: Write the failing test**

```bash
rg -n "rusqlite" src-tauri crates/copilot_client
```

Expected: Finds no matches after removal.

**Step 2: Run test to verify it fails**

Run: `rg -n "rusqlite" src-tauri crates/copilot_client`
Expected: FAIL with existing matches.

**Step 3: Write minimal implementation**

Remove `rusqlite` from both Cargo manifests and run `cargo build` to regenerate `Cargo.lock`.

**Step 4: Run test to verify it passes**

Run: `rg -n "rusqlite" src-tauri crates/copilot_client`
Expected: No output

**Step 5: Commit**

```bash
git add src-tauri/Cargo.toml crates/copilot_client/Cargo.toml Cargo.lock
 git commit -m "chore: remove rusqlite dependency"
```

### Task 6: Validation

**Files:**
- None

**Step 1: Run Rust tests**

Run: `cargo test --package copilot_chat`
Expected: PASS

**Step 2: Run frontend tests**

Run: `npm run test -- SystemSettingsKeywordMaskingTab`
Expected: PASS

**Step 3: Run OpenSpec validation**

Run: `openspec validate refactor-settings-storage-json --strict`
Expected: PASS

**Step 4: Commit (if needed)**

```bash
git status -sb
```
Expected: clean working tree
