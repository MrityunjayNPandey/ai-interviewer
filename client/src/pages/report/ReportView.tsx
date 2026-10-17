import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import StarOutlineRounded from "@mui/icons-material/StarOutlineRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useModels } from "../../api/queries";
import { DIFFICULTY_LABELS, INTERVIEW_TYPE_LABELS, MODE_LABELS, type InterviewView } from "../../api/types";
import { useDeleteInterview, usePractiseAgain } from "../../api/mutations";
import ConfirmDeleteDialog from "../../components/ConfirmDeleteDialog";
import { TurnTranscript } from "../interview/Transcript";
import { ScoreChip, ScoreMeter, ScoresByQuestion } from "./ScoreVisuals";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function ReportView({ interview }: { interview: InterviewView }) {
  const { setup, report, turns } = interview;
  const models = useModels();
  const practiseAgain = usePractiseAgain();
  const remove = useDeleteInterview({ redirectTo: "/" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const modelLabel = (id: string) => models.data?.find((model) => model.id === id)?.label ?? id.split(":").slice(1).join(":");

  const actions = (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      <Button
        variant="contained"
        startIcon={<ReplayRounded />}
        disabled={practiseAgain.isPending}
        onClick={() => practiseAgain.mutate(interview.id)}
      >
        Practise again
      </Button>
      <Button component={Link} to="/" startIcon={<ArrowBackRounded />}>
        All interviews
      </Button>
    </Stack>
  );

  return (
    <Stack spacing={3} sx={{ maxWidth: 960, mx: "auto" }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" } }}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Interview report · {formatDate(interview.completedAt ?? interview.createdAt)}
          </Typography>
          <Typography variant="h4" component="h1">
            {setup.requirements.title}
            {setup.requirements.company ? ` · ${setup.requirements.company}` : ""}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
            <Chip size="small" label={INTERVIEW_TYPE_LABELS[setup.interviewType]} />
            <Chip size="small" label={DIFFICULTY_LABELS[setup.difficulty]} />
            <Chip size="small" label={`${MODE_LABELS[setup.mode].label} mode`} />
            {report && <Chip size="small" variant="outlined" label={`Assessed by ${modelLabel(report.modelId)}`} />}
          </Stack>
        </Box>
        {actions}
      </Stack>

      {practiseAgain.error && <Alert severity="error">{practiseAgain.error.message}</Alert>}

      {!report ? (
        <Alert severity="info">This interview ended without a report.</Alert>
      ) : (
        <>
          <Card>
            <CardContent>
              <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 5 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Overall score
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                      <Typography sx={{ fontSize: { xs: 56, md: 64 }, fontWeight: 700, lineHeight: 1 }}>{report.overallScore}</Typography>
                      <Typography variant="h5" color="text.secondary">
                        / 10
                      </Typography>
                    </Stack>
                    <ScoreMeter score={report.overallScore} />
                    <Box>
                      <ScoreChip score={report.overallScore} size="medium" />
                    </Box>
                    <Typography>{report.summary}</Typography>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, md: 7 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Score by question
                  </Typography>
                  <ScoresByQuestion
                    scores={report.questions.map((entry) => ({
                      index: entry.index,
                      score: entry.score,
                      question: turns[entry.index]?.question ?? "",
                    }))}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Card sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    What went well
                  </Typography>
                  <List dense disablePadding>
                    {report.strengths.map((strength) => (
                      <ListItem key={strength} disableGutters alignItems="flex-start">
                        <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                          <StarOutlineRounded color="success" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={strength} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <Card sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    What to work on next
                  </Typography>
                  <Stack spacing={1.5}>
                    {report.improvements.map((item) => (
                      <Stack key={item.area} direction="row" spacing={1.5}>
                        <LightbulbOutlined color="warning" fontSize="small" sx={{ mt: 0.25 }} />
                        <Box>
                          <Typography sx={{ fontWeight: 600 }}>{item.area}</Typography>
                          <Typography color="text.secondary">{item.suggestion}</Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      <Box>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          Question by question
        </Typography>
        {turns.filter((turn) => turn.answer).map((turn) => {
          const assessment = report?.questions.find((entry) => entry.index === turn.index);
          return (
            <Accordion key={turn.index} disableGutters variant="outlined" sx={{ "&:not(:last-of-type)": { borderBottom: 0 } }}>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1, sm: 2 }} sx={{ alignItems: { sm: "center" }, width: "100%", pr: 1 }}>
                  <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>
                    Q{turn.index + 1}. {turn.question}
                  </Typography>
                  {assessment && <ScoreChip score={assessment.score} />}
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2.5}>
                  {assessment && (
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover", height: "100%" }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Assessment
                          </Typography>
                          <Typography variant="body2">{assessment.note}</Typography>
                        </Box>
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "primary.main", height: "100%" }}>
                          <Typography variant="subtitle2" gutterBottom>
                            A strong answer would include
                          </Typography>
                          <Typography variant="body2">{assessment.strongAnswer}</Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  )}
                  <TurnTranscript turn={turn} showCoaching />
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
        {actions}
        <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => setConfirmDelete(true)}>
          Delete this interview
        </Button>
      </Stack>

      <ConfirmDeleteDialog
        open={confirmDelete}
        pending={remove.isPending}
        error={remove.error}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate(interview.id)}
      />
    </Stack>
  );
}
