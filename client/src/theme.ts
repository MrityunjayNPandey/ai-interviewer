import { createTheme } from "@mui/material/styles";

// Light and dark palettes; the toggle in the header switches between them (MUI stores the choice).
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#4f46e5" },
        secondary: { main: "#0d9488" },
        background: { default: "#f7f7fb", paper: "#ffffff" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#a5b4fc" },
        secondary: { main: "#5eead4" },
        background: { default: "#0f1117", paper: "#171a23" },
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontWeight: 700, letterSpacing: "-0.01em" },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiCard: {
      defaultProps: { variant: "outlined" },
    },
    MuiTextField: { defaultProps: { fullWidth: true } },
  },
});
