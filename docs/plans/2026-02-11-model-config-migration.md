# Model Config Migration Plan

## 目标
将模型选择从 localStorage 迁移到 `~/.bamboo/config.json`，解决 Session 文件记录错误模型的问题。

## 不涉及的内容
- 不添加 `agent_enabled` / `mcp_enabled` 开关
- 不改变 Agent 架构
- 只迁移 `model` 字段

## 实施步骤

### Step 1: 后端支持 merge-write

**文件**: `crates/web_service/src/controllers/bamboo_controller.rs`

**修改 1.1**: 添加 merge_json_value 函数
```rust
fn merge_json_value(base: &mut Value, patch: Value) {
    match (base, patch) {
        (Value::Object(base_obj), Value::Object(patch_obj)) => {
            for (key, patch_value) in patch_obj {
                match base_obj.get_mut(&key) {
                    Some(base_value) => merge_json_value(base_value, patch_value),
                    None => {
                        base_obj.insert(key, patch_value);
                    }
                }
            }
        }
        (base_slot, patch_value) => {
            *base_slot = patch_value;
        }
    }
}
```

**修改 1.2**: 修改 set_bamboo_config 为 merge-write
```rust
#[post("/bamboo/config")]
pub async fn set_bamboo_config(
    app_state: web::Data<AppState>,
    payload: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    let patch = strip_proxy_auth(payload.into_inner());

    let mut base = match fs::read_to_string(&path).await {
        Ok(content) => serde_json::from_str::<Value>(&content)?,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => serde_json::json!({}),
        Err(err) => return Err(AppError::StorageError(err)),
    };

    if !base.is_object() || !patch.is_object() {
        return Err(AppError::InternalError(anyhow::anyhow!(
            "config.json must be a JSON object"
        )));
    }

    merge_json_value(&mut base, patch);
    let merged = clean_empty_proxy_fields(strip_proxy_auth(base));
    let content = serde_json::to_string_pretty(&merged)?;
    fs::write(path, content).await?;
    Ok(HttpResponse::Ok().json(merged))
}
```

---

### Step 2: 前端创建 ConfigRepository

**文件**: `src/pages/ChatPage/services/ConfigRepository.ts` (新建)

```typescript
import { serviceFactory } from "../../../services/common/ServiceFactory";

const LEGACY_SELECTED_MODEL_KEY = "copilot_selected_model_id";

export type BambooConfig = {
  http_proxy?: string;
  https_proxy?: string;
  proxy_auth_mode?: string;
  api_key?: string | null;
  api_base?: string | null;
  model?: string | null;
  headless_auth?: boolean;
  [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeModelId = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export class ConfigRepository {
  private static instance: ConfigRepository;
  private cache: BambooConfig | null = null;
  private loadInFlight: Promise<BambooConfig> | null = null;

  private constructor() {}

  static getInstance(): ConfigRepository {
    if (!ConfigRepository.instance) {
      ConfigRepository.instance = new ConfigRepository();
    }
    return ConfigRepository.instance;
  }

  getLegacySelectedModelSnapshot(): string | undefined {
    try {
      const stored = localStorage.getItem(LEGACY_SELECTED_MODEL_KEY);
      return stored || undefined;
    } catch {
      return undefined;
    }
  }

  private writeLegacySelectedModel(modelId: string | undefined): void {
    if (!modelId) {
      return;
    }
    try {
      localStorage.setItem(LEGACY_SELECTED_MODEL_KEY, modelId);
    } catch {}
  }

  private clearLegacySelectedModel(): void {
    try {
      localStorage.removeItem(LEGACY_SELECTED_MODEL_KEY);
    } catch {}
  }

  async getConfig(force = false): Promise<BambooConfig> {
    if (this.cache && !force) {
      return this.cache;
    }
    if (this.loadInFlight) {
      return this.loadInFlight;
    }

    this.loadInFlight = (async () => {
      const config = await serviceFactory.getBambooConfig();
      this.cache = isRecord(config) ? config : {};
      return this.cache;
    })();

    try {
      return await this.loadInFlight;
    } finally {
      this.loadInFlight = null;
    }
  }

  async updateConfig(patch: Partial<BambooConfig>): Promise<BambooConfig> {
    const previous = this.cache ?? {};
    const optimistic = { ...previous, ...patch };
    this.cache = optimistic;

    try {
      const saved = await serviceFactory.setBambooConfig(patch);
      const normalized = isRecord(saved) ? saved : {};
      this.cache = normalized;
      return normalized;
    } catch (error) {
      this.cache = previous;
      throw error;
    }
  }

  async getSelectedModel(): Promise<string | undefined> {
    try {
      const config = await this.getConfig();
      return normalizeModelId(config.model);
    } catch {
      return this.getLegacySelectedModelSnapshot();
    }
  }

  async setSelectedModel(modelId: string | undefined): Promise<void> {
    const normalized = normalizeModelId(modelId);
    try {
      await this.updateConfig({ model: normalized ?? null });
      this.clearLegacySelectedModel();
    } catch (error) {
      if (normalized) {
        this.writeLegacySelectedModel(normalized);
      }
      throw error;
    }
  }

  async migrateSelectedModelFromLegacy(): Promise<string | undefined> {
    const legacy = this.getLegacySelectedModelSnapshot();

    try {
      const config = await this.getConfig();
      const stored = normalizeModelId(config.model);
      if (stored) {
        if (legacy) {
          this.clearLegacySelectedModel();
        }
        return stored;
      }
    } catch {
      return legacy;
    }

    if (!legacy) {
      return undefined;
    }

    try {
      await this.updateConfig({ model: legacy });
      this.clearLegacySelectedModel();
    } catch {
      this.writeLegacySelectedModel(legacy);
    }

    return legacy;
  }
}

export const configRepository = ConfigRepository.getInstance();
```

---

### Step 3: 修改 modelSlice 使用 ConfigRepository

**文件**: `src/pages/ChatPage/store/slices/modelSlice.ts`

**修改 3.1**: 导入 ConfigRepository
```typescript
import { StateCreator } from "zustand";
import {
  modelService,
  ProxyAuthRequiredError,
} from "../../services/ModelService";
import { configRepository } from "../../services/ConfigRepository";
import type { AppState } from "../";

const FALLBACK_MODELS = ["gpt-5-mini", "gpt-5", "gemini-2.5-pro"];
```

**修改 3.2**: 修改初始化逻辑
```typescript
// 同步读取 legacy localStorage 避免启动时 fallback
const getInitialSelectedModel = (): string | undefined =>
  configRepository.getLegacySelectedModelSnapshot();
```

**修改 3.3**: 修改 setSelectedModel
```typescript
setSelectedModel: (modelId) => {
  set({ selectedModel: modelId });
  void configRepository.setSelectedModel(modelId);
},
```

**修改 3.4**: 修改 fetchModels 中的模型选择逻辑
```typescript
fetchModels: async () => {
  if (fetchModelsInFlight) {
    return fetchModelsInFlight;
  }

  fetchModelsInFlight = (async () => {
    set({ isLoadingModels: true, modelsError: null });
    try {
      const availableModels = await modelService.getModels();

      // 从 config.json 迁移（或获取已存储的）
      const storedModelId = await configRepository.migrateSelectedModelFromLegacy();
      const currentSelected = get().selectedModel;

      let newSelectedModel = currentSelected;

      if (currentSelected && availableModels.includes(currentSelected)) {
        // Current selection is valid, do nothing
      } else if (storedModelId && availableModels.includes(storedModelId)) {
        newSelectedModel = storedModelId;
      } else if (availableModels.length > 0) {
        newSelectedModel = availableModels[0];
      } else {
        newSelectedModel = undefined;
      }

      set({
        models: availableModels,
        selectedModel: newSelectedModel,
        modelsError:
          availableModels.length > 0 ? null : "No available model options",
      });

      if (newSelectedModel && newSelectedModel !== storedModelId) {
        void configRepository.setSelectedModel(newSelectedModel);
      }

      if (get().models.length === 0) {
        console.warn("No models available from service");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch models:", err);

      if (err instanceof ProxyAuthRequiredError) {
        const storedModelId = await configRepository.migrateSelectedModelFromLegacy();
        const fallbackModel =
          get().selectedModel || storedModelId || FALLBACK_MODELS[0];

        set((state) => ({
          ...state,
          models: state.models.length > 0 ? state.models : FALLBACK_MODELS,
          selectedModel: state.selectedModel || fallbackModel,
          modelsError:
            errorMessage ||
            "Proxy authentication required. Please configure proxy auth.",
        }));
        return;
      }

      const storedModelId = await configRepository.migrateSelectedModelFromLegacy();
      if (storedModelId) {
        set({
          models: [storedModelId],
          selectedModel: storedModelId,
          modelsError: errorMessage,
        });
      } else {
        const fallbackModel = FALLBACK_MODELS[0];
        console.warn("Using fallback models due to service unavailability");
        set({
          models: FALLBACK_MODELS,
          selectedModel: fallbackModel,
          modelsError: errorMessage,
        });
      }
    } finally {
      set({ isLoadingModels: false });
    }
  })();

  try {
    await fetchModelsInFlight;
  } finally {
    fetchModelsInFlight = null;
  }
},
```

---

### Step 4: 修复 Agent Server 硬编码模型

**文件**: `crates/web_service/src/server.rs`

**修改 4.1**: 从 config 读取模型
```rust
async fn build_agent_state(app_data_dir: PathBuf, port: u16) -> AgentAppState {
    let base_url = format!("http://127.0.0.1:{}/v1", port);

    // 读取 config.json 获取模型
    let model = read_model_from_config(&app_data_dir).await
        .unwrap_or_else(|| "gpt-4o-mini".to_string());

    AgentAppState::new_with_config(
        "openai",
        base_url,
        model,
        "tauri".to_string(),
        Some(app_data_dir),
        true,
    )
    .await
}

async fn read_model_from_config(app_data_dir: &std::path::Path) -> Option<String> {
    let config_path = app_data_dir.join("config.json");
    let content = tokio::fs::read_to_string(config_path).await.ok()?;
    let config: serde_json::Value = serde_json::from_str(&content).ok()?;
    config.get("model")?.as_str().map(|s| s.to_string())
}
```

---

## 文件修改清单

| 文件 | 操作 | 说明 |
|-----|------|------|
| `crates/web_service/src/controllers/bamboo_controller.rs` | 修改 | 添加 merge_json_value，支持 merge-write |
| `src/pages/ChatPage/services/ConfigRepository.ts` | 新建 | 配置管理仓库 |
| `src/pages/ChatPage/store/slices/modelSlice.ts` | 修改 | 使用 ConfigRepository |
| `crates/web_service/src/server.rs` | 修改 | 从 config 读取模型 |

---

## 测试计划

### 测试 1: 首次迁移
1. 清空 `~/.bamboo/config.json` 中的 `model` 字段
2. 在 localStorage 中设置 `copilot_selected_model_id` 为某个值
3. 启动应用
4. 验证：
   - config.json 中应有 `model` 字段，值为 localStorage 的值
   - localStorage 中的 key 应被清除

### 测试 2: 模型选择持久化
1. 在 Settings 中切换模型
2. 刷新页面
3. 验证：
   - 选择的模型应保持不变
   - config.json 中 `model` 字段已更新

### 测试 3: Session 记录正确模型
1. 创建新 Session
2. 检查 Session 文件中的 `model_name`
3. 验证：应与 config.json 中的 `model` 一致

### 测试 4: 降级兼容
1. 断开网络（模拟 config API 失败）
2. 选择模型
3. 验证：
   - 应回退到 localStorage
   - 网络恢复后应同步到 config

---

## 回滚计划

如果出现问题：

1. 恢复 `modelSlice.ts` 到旧版本（使用 localStorage）
2. 删除 `ConfigRepository.ts`
3. 用户选择的模型不会丢失（仍在 localStorage 或 config.json 中）
