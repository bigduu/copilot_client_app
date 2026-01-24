## 1. Review and plan

- [x] 1.1 Inventory pages/components using custom HTML/CSS (ChatView, ChatSidebar, AgentView, AgentSidebar, Debug panels, SystemSettingsPage, FolderBrowser, TodoListDisplay, layouts).
- [x] 1.2 Map each area to Ant Design components and document required CSS exceptions.

## 2. Migrate Chat UI

- [x] 2.1 Replace ChatView layout wrappers with Ant Design Layout/Flex/Space/Card/List.
- [x] 2.2 Update ChatSidebar to use Ant Design Menu/List/Buttons/Tabs where applicable.
- [x] 2.3 Reduce ChatView CSS to only scroll, animation, and virtualization needs.

## 3. Migrate Agent UI

- [x] 3.1 Replace AgentView and AgentChatView wrappers with Ant Design components.
- [x] 3.2 Update AgentSidebar to Ant Design components for lists and controls.
- [x] 3.3 Reduce AgentView CSS to only required exceptions.

## 4. Migrate Debug and Settings UI

- [x] 4.1 Replace Debug view layouts with Ant Design components.
- [x] 4.2 Review SystemSettingsPage and related panels for remaining custom styling and migrate.

## 5. Cleanup and verification

- [x] 5.1 Remove unused CSS and keep scoped overrides only.
- [ ] 5.2 Verify light/dark mode consistency and scroll behavior on all pages.
