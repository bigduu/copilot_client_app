## Why

The Config page currently requires manual JSON editing for basic settings. Users need a simple form for each supported config field while still keeping an advanced JSON editor available when needed. The model selector should live in the Config flow (using a dropdown) and the standalone Model tab can be removed.

## What Changes

- Add a form-based Config UI for `http_proxy`, `https_proxy`, `api_key`, `api_base`, `model`, and `headless_auth`.
- Keep the JSON editor as a collapsible “Advanced” section that stays in sync with the form.
- Move model selection into the Config form using the existing dropdown options.
- Remove the standalone Model tab and relocate the backend base URL control into the Config tab.

## Impact

- Affected specs: backend-config
- Affected code: `src/pages/SettingsPage`, `src/pages/ChatPage/store`
