import { Button, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", py: 8 }}>
      <Typography variant="h4">Page not found</Typography>
      <Typography color="text.secondary">That page doesn't exist, or the interview was deleted.</Typography>
      <Button component={Link} to="/" variant="contained">
        Go home
      </Button>
    </Stack>
  );
}
