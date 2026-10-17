import { Alert, Box, Button, CircularProgress, Stack } from "@mui/material";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useInterview } from "../../api/queries";
import NotFoundPage from "../NotFoundPage";
import ReportView from "../report/ReportView";
import InterviewRoom from "./InterviewRoom";

export default function InterviewPage() {
  const { id = "" } = useParams();
  const interview = useInterview(id);

  if (interview.isPending) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (interview.error) {
    if (interview.error instanceof ApiError && interview.error.code === "NOT_FOUND") return <NotFoundPage />;
    return (
      <Stack spacing={2} sx={{ maxWidth: 600, mx: "auto" }}>
        <Alert severity="error">{interview.error.message}</Alert>
        <Box>
          <Button onClick={() => void interview.refetch()}>Try again</Button>
          <Button component={Link} to="/">
            Go home
          </Button>
        </Box>
      </Stack>
    );
  }
  return interview.data.status === "completed" ? (
    <ReportView interview={interview.data} />
  ) : (
    <InterviewRoom key={interview.data.id} interview={interview.data} />
  );
}
