# React Development Rules (with TypeScript, Vite, Ant Design)

You are an expert AI programming assistant specializing in React, TypeScript, and modern frontend development. This project uses Vite for bundling and Ant Design for UI components.

**Core Principles:**

*   **TypeScript First:** All React code must be written in TypeScript. Utilize strong typing to improve code quality and catch errors early. Prefer interfaces over types for defining props and state, unless a type alias is more appropriate (e.g., for union types or utility types).
*   **Functional Components & Hooks:** Exclusively use functional components with React Hooks (`useState`, `useEffect`, `useContext`, `useReducer`, `useCallback`, `useMemo`, `useRef`). Avoid class components.
*   **Conciseness & Readability:** Write concise, clear, and well-documented TypeScript code. Use descriptive names for variables, functions, and components (e.g., `isLoading`, `hasError`, `UserProfileCard`).
*   **Modularity:** Break down complex UIs into smaller, reusable components. Each component should have a single responsibility.
*   **Immutability:** Treat props and state as immutable. When updating state based on previous state, use the functional update form of `setState`.
*   **Avoid Enums:** Prefer using string literal unions or object maps over enums for better JavaScript interoperability and bundle size. Example: `type Status = 'idle' | 'loading' | 'succeeded' | 'failed';`

**File Structure & Naming:**

*   **Component Directories:** Group related files (e.g., `MyComponent.tsx`, `MyComponent.module.css`, `MyComponent.types.ts`) within their own directory (e.g., `src/components/MyComponent/`).
*   **Naming Conventions:**
    *   Component files: PascalCase (e.g., `UserProfile.tsx`).
    *   Hook files: camelCase with `use` prefix (e.g., `useAuth.ts`).
    *   Type files: PascalCase or camelCase with `.types.ts` or `.d.ts` (e.g., `Chat.types.ts`).
    *   Directories: kebab-case (e.g., `user-profile`).
*   **Exports:** Prefer named exports for components and utilities. Use default exports sparingly, perhaps for top-level page components if that's a project convention.

**Component Design:**

*   **Props:** Clearly define prop interfaces. Use `React.FC<Props>` for functional components. Provide default props where sensible.
*   **Destructuring Props:** Destructure props at the beginning of the component for clarity.
*   **Conditional Rendering:** Use clear and concise conditional rendering (e.g., `&&` operator for simple cases, ternary operators, or early returns).
*   **Keys in Lists:** Always provide stable and unique `key` props when rendering lists of elements. Avoid using array indices as keys if the list can be reordered or filtered.

**State Management:**

*   **Local State:** Use `useState` for simple, local component state.
*   **Complex Local State:** Use `useReducer` for more complex state logic within a component or when the next state depends on the previous one in a non-trivial way.
*   **Global State / Context:** Utilize React Context (`useContext`) for global state or state that needs to be shared across many components (e.g., theme, user authentication, as seen with `ChatContext` and `AuthContext`). Design contexts to be specific to a domain to avoid overly large or coupled contexts.
*   **Data Fetching & Caching:** Consider using custom hooks for data fetching logic. For more advanced scenarios like caching, request deduplication, and optimistic updates, a dedicated data-fetching library could be integrated if needed, but for now, focus on clean custom hooks.

**Styling:**

*   **Ant Design:** Leverage Ant Design (`antd`) for UI components and its styling system. Customize Ant Design components as needed using its theming capabilities or by overriding styles carefully.
*   **CSS Modules or Styled Components:** For custom component styling beyond Ant Design, choose a consistent approach (e.g., CSS Modules for scoped CSS, or a CSS-in-JS library if preferred, though CSS Modules are often simpler with Vite). The project currently uses plain CSS files per component (e.g., `styles.css`), ensure these are scoped or named carefully to avoid collisions.
*   **Tailwind CSS (If Applicable):** If Tailwind CSS were to be introduced, ensure it's configured correctly with Vite and PostCSS. (Note: Currently, Ant Design is the primary UI library, not Tailwind).

**Performance:**

*   **`React.memo`:** Use `React.memo` to memoize functional components and prevent unnecessary re-renders if their props haven't changed.
*   **`useCallback`:** Use `useCallback` to memoize functions passed as props to child components, especially if those children are memoized with `React.memo`.
*   **`useMemo`:** Use `useMemo` to memoize expensive calculations.
*   **Lazy Loading:** Use `React.lazy` and `Suspense` for code-splitting and lazy loading components, especially for route-based splitting or large, non-critical components.
*   **Virtualization:** For long lists, consider using a virtualization library (e.g., `react-window` or `react-virtualized`) to improve rendering performance.

**Error Handling:**

*   **Error Boundaries:** Implement React Error Boundaries to catch JavaScript errors in their child component tree, log those errors, and display a fallback UI.
*   **Async/Await Error Handling:** Use `try...catch` blocks or `.catch()` with promises for handling errors in asynchronous operations (e.g., API calls).

**Interacting with Tauri Backend (if applicable):**

*   **Tauri API (`@tauri-apps/api`):** Use the `@tauri-apps/api/core` or specific plugin APIs (e.g., `@tauri-apps/api/event`, `@tauri-apps/api/fs`) to communicate with the Rust backend.
*   **Invoke Commands:** Use `invoke` from `@tauri-apps/api/core` to call Rust commands. Ensure proper error handling for these invocations.
*   **Type Safety:** Define clear TypeScript interfaces for the data exchanged between the frontend and the Tauri backend to maintain type safety.

**Testing:**

*   While not explicitly requested, consider incorporating testing (e.g., with Vitest and React Testing Library) as the project grows.

**Vite Specifics:**

*   Leverage Vite's fast HMR and build process.
*   Utilize Vite's environment variable handling (`import.meta.env`).

This set of rules should provide a good foundation for React development in your project.
