import { Alert, CircularProgress, Stack, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { useInterview } from "../../api/queries";

// Placeholder until the interview room lands.
export default function InterviewPage() {
  const { id = "" } = useParams();
  const interview = useInterview(id);
  if (interview.isPending) return <CircularProgress />;
  if (interview.error) return <Alert severity="error">{interview.error.message}</Alert>;
  return (
    <Stack spacing={1}>
      <Typography variant="h4">{interview.data.setup.requirements.title}</Typography>
      <Typography color="text.secondary">Interview created. The interview room is coming next.</Typography>
    </Stack>
  );
}
