import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import { AppBar, Box, Container, IconButton, Link, Toolbar, Tooltip, Typography } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { Outlet, Link as RouterLink } from "react-router-dom";

function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const current = mode === "system" ? systemMode : mode;
  if (!current) return null; // Not resolved yet on first render.
  const next = current === "dark" ? "light" : "dark";
  return (
    <Tooltip title={`Switch to ${next} mode`}>
      <IconButton onClick={() => setMode(next)} aria-label={`Switch to ${next} mode`}>
        {current === "dark" ? <LightModeOutlined /> : <DarkModeOutlined />}
      </IconButton>
    </Tooltip>
  );
}

export default function Layout() {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ gap: 1 }}>
            <Link
              component={RouterLink}
              to="/"
              underline="none"
              color="inherit"
              sx={{ display: "flex", alignItems: "center", gap: 1, flexGrow: 1 }}
            >
              <Box component="img" src="/favicon.svg" alt="" sx={{ width: 28, height: 28 }} />
              <Typography variant="h6" component="span">
                AI Interviewer
              </Typography>
            </Link>
            <ThemeToggle />
          </Toolbar>
        </Container>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ flexGrow: 1, py: { xs: 3, md: 5 } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
