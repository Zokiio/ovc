# Theming System Documentation

This project uses a **CSS Variable-driven Theming System**. The UI components are decoupled from specific colors and styles, allowing for easy expansion and real-time switching.

## Architecture Overview

1.  **`src/theme.css`**: Contains all theme definitions. Each theme is defined under a `[data-theme="theme-name"]` selector.
2.  **`src/context/ThemeContext.tsx`**: Manages the active theme state and applies the `data-theme` attribute to the HTML root.
3.  **`src/components/CommonUI.tsx`**: High-level components (`Panel`, `Button`, `Input`, etc.) that consume the CSS variables.

---

## How to Add a New Theme

### Step 1: Define Variables
Add a new block in `src/theme.css`. You can copy an existing theme and modify the values:

```css
[data-theme="neon-night"] {
  /* Backgrounds */
  --bg-app: #0d0221;
  --bg-panel: #261447;
  --bg-panel-header: #2d1b4d;
  --bg-input: #0d0221;
  
  /* Borders */
  --border-primary: #5a189a;
  --border-active: #ff0054;
  
  /* Text */
  --text-primary: #ff85a1;
  --text-secondary: #7b2cbf;
  --text-accent: #ff0054;
  
  /* Accents */
  --accent-primary: #ff0054;
  --accent-secondary: #3c096c;
  --accent-danger: #9d0208;
  --accent-success: #390099;
  --accent-warning: #ffbd00;

  /* Typography */
  --font-heading: 'Orbitron', sans-serif;
  --font-body: 'Inter', sans-serif;
  
  /* Shapes */
  --radius-panel: 0px;
  --radius-btn: 0px;
  
  /* Effects */
  --shadow-glow: 0 0 15px rgba(255, 0, 84, 0.5);
}
```

### Step 2: Register in TypeScript
Update the `Theme` type in `src/context/ThemeContext.tsx`:

```typescript
type Theme = 'industrial' | 'hytale' | 'neon-night';
```

### Step 3: Update Switcher Logic (Optional)
If you want the toggle button to include the new theme, update the `toggleTheme` function in `ThemeContext.tsx` to cycle through your new list.

---

## Variable Reference Table

| Variable | Description |
| :--- | :--- |
| `--bg-app` | Main background of the application. |
| `--bg-panel` | Background for cards, sidebars, and panels. |
| `--bg-panel-header` | Background for headers/titles within panels. |
| `--border-primary` | Default border color for all UI elements. |
| `--border-active` | Highlight color for focus states and active selections. |
| `--text-primary` | Main text color for readability. |
| `--text-secondary` | Muted text for labels and secondary info. |
| `--accent-primary` | Primary action color (used for main buttons). |
| `--font-heading` | Font family used for titles and buttons. |
| `--font-body` | Font family used for standard text and inputs. |
| `--radius-panel` | Corner roundness for panels. |
| `--shadow-glow` | Box-shadow used for "glowing" or "mana" effects. |

---

## Best Practices
- **Use Opacity:** You can use CSS variables with opacity in tailwind: `bg-[var(--accent-primary)]/20`.
- **Transitions:** All color changes are automatically transitioned via the `transition-colors` class in `CommonUI.tsx`.
- **Typography:** Ensure any custom fonts are imported in `index.html`.
