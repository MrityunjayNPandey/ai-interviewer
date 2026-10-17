import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useDeleteInterview, usePractiseAgain } from "../api/mutations";
import { useInterviews } from "../api/queries";
import { DIFFICULTY_LABELS, INTERVIEW_TYPE_LABELS, type InterviewSummary } from "../api/types";
import ConfirmDeleteDialog from "../components/ConfirmDeleteDialog";
import { ScoreChip } from "./report/ScoreVisuals";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function HistoryRow({ interview, onDelete }: { interview: InterviewSummary; onDelete: () => void }) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const practiseAgain = usePractiseAgain();
  const inProgress = interview.status === "in_progress";

  return (
    <Card>
      <Stack direction="row" sx={{ alignItems: "stretch" }}>
        <CardActionArea component={Link} to={`/interviews/${interview.id}`} sx={{ p: 2, flexGrow: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }} noWrap>
                {interview.roleTitle}
                {interview.company ? ` · ${interview.company}` : ""}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDate(interview.createdAt)} · {INTERVIEW_TYPE_LABELS[interview.interviewType]} ·{" "}
                {DIFFICULTY_LABELS[interview.difficulty]} · {interview.answeredCount}/{interview.length} answered
              </Typography>
            </Box>
            <Box sx={{ flexShrink: 0 }}>
              {inProgress ? (
                <Chip size="small" color="primary" label="In progress · Resume" />
              ) : interview.overallScore !== null ? (
                <ScoreChip score={interview.overallScore} />
              ) : (
                <Chip size="small" label="Completed" />
              )}
            </Box>
          </Stack>
        </CardActionArea>
        <Box sx={{ display: "flex", alignItems: "center", pr: 1 }}>
          <IconButton aria-label="More actions" onClick={(event) => setMenuAnchor(event.currentTarget)} disabled={practiseAgain.isPending}>
            <MoreVertRounded />
          </IconButton>
        </Box>
      </Stack>
      {practiseAgain.error && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {practiseAgain.error.message}
        </Alert>
      )}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            practiseAgain.mutate(interview.id);
          }}
        >
          Practise again with the same setup
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            setMenuAnchor(null);
            onDelete();
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Card>
  );
}

/** This browser's interviews, newest first. Renders nothing until there is at least one. */
export default function InterviewHistory() {
  const interviews = useInterviews();
  const remove = useDeleteInterview();
  const [deleting, setDeleting] = useState<string | null>(null);

  if (interviews.isPending) {
    return (
      <Stack spacing={1.5}>
        <Skeleton variant="text" width={200} height={36} />
        <Skeleton variant="rounded" height={72} />
      </Stack>
    );
  }
  if (interviews.error) return <Alert severity="error">Couldn't load your interviews: {interviews.error.message}</Alert>;
  if (!interviews.data.length) return null;

  return (
    <Box component="section" aria-labelledby="history-heading">
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography id="history-heading" variant="h5" component="h2">
          Your interviews
        </Typography>
        <Button component={Link} to="/new" variant="outlined">
          New interview
        </Button>
      </Stack>
      <Stack spacing={1.5}>
        {interviews.data.map((interview) => (
          <HistoryRow key={interview.id} interview={interview} onDelete={() => setDeleting(interview.id)} />
        ))}
      </Stack>
      <ConfirmDeleteDialog
        open={deleting !== null}
        pending={remove.isPending}
        error={remove.error}
        onCancel={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={() => remove.mutate(deleting!, { onSuccess: () => setDeleting(null) })}
      />
    </Box>
  );
}
