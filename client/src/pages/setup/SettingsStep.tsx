import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Grid,
  Skeleton,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { rememberInterview, useModels } from "../../api/queries";
import {
  DIFFICULTY_LABELS,
  INTERVIEW_TYPE_LABELS,
  MAX_LENGTH,
  MIN_LENGTH,
  MODE_LABELS,
  type Difficulty,
  type InterviewType,
  type InterviewView,
  type Mode,
  type Setup,
} from "../../api/types";
import ModelSelect from "../../components/ModelSelect";
import { cleanProfile, cleanRequirements, type Draft } from "./draft";

type Props = { draft: Draft; update: (changes: Partial<Draft>) => void; reset: () => void };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      {hint && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {hint}
        </Typography>
      )}
      <Box sx={{ mt: hint ? 0 : 1 }}>{children}</Box>
    </Box>
  );
}

export default function SettingsStep({ draft, update, reset }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const models = useModels();
  const defaultModel = models.data?.find((model) => model.isDefault) ?? models.data?.[0];
  const modelId = models.data?.some((model) => model.id === draft.modelId) ? draft.modelId! : defaultModel?.id;

  const start = useMutation({
    mutationFn: () => {
      const setup: Setup = {
        resumeText: draft.resumeText,
        jobDescription: draft.jobDescription,
        profile: cleanProfile(draft.profile!),
        requirements: cleanRequirements(draft.requirements!),
        match: draft.match,
        interviewType: draft.interviewType,
        difficulty: draft.difficulty,
        length: draft.length,
        mode: draft.mode,
        modelId: modelId!,
      };
      return api.post<{ interview: InterviewView }>("/interviews", setup);
    },
    onSuccess: ({ interview }) => {
      rememberInterview(queryClient, interview);
      reset();
      navigate(`/interviews/${interview.id}`);
    },
  });

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack spacing={3.5}>
            <Field label="Interview type">
              <ToggleButtonGroup
                exclusive
                color="primary"
                value={draft.interviewType}
                onChange={(_event, value: InterviewType | null) => value && update({ interviewType: value })}
              >
                {(Object.keys(INTERVIEW_TYPE_LABELS) as InterviewType[]).map((type) => (
                  <ToggleButton key={type} value={type} sx={{ px: 3 }}>
                    {INTERVIEW_TYPE_LABELS[type]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Field>

            <Field label="Difficulty">
              <ToggleButtonGroup
                exclusive
                color="primary"
                value={draft.difficulty}
                onChange={(_event, value: Difficulty | null) => value && update({ difficulty: value })}
              >
                {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((difficulty) => (
                  <ToggleButton key={difficulty} value={difficulty} sx={{ px: 3 }}>
                    {DIFFICULTY_LABELS[difficulty]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Field>

            <Field label={`Length: ${draft.length} questions`} hint="About 2–3 minutes per question. You can end early.">
              <Box sx={{ px: 1, maxWidth: 420 }}>
                <Slider
                  value={draft.length}
                  min={MIN_LENGTH}
                  max={MAX_LENGTH}
                  step={1}
                  marks
                  valueLabelDisplay="auto"
                  onChange={(_event, value) => update({ length: value as number })}
                  aria-label="Number of questions"
                />
              </Box>
            </Field>

            <Field label="Mode">
              <Grid container spacing={2}>
                {(Object.keys(MODE_LABELS) as Mode[]).map((mode) => {
                  const selected = draft.mode === mode;
                  return (
                    <Grid key={mode} size={{ xs: 12, sm: 6 }}>
                      <Card sx={{ borderColor: selected ? "primary.main" : "divider", borderWidth: selected ? 2 : 1 }}>
                        <CardActionArea onClick={() => update({ mode })} aria-pressed={selected} sx={{ p: 2 }}>
                          <Typography sx={{ fontWeight: 600 }}>{MODE_LABELS[mode].label}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {MODE_LABELS[mode].description}
                          </Typography>
                        </CardActionArea>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Field>

            <Field label="Interviewer model" hint="All free. You can switch later if a model is busy.">
              {models.isPending ? (
                <Skeleton variant="rounded" height={56} />
              ) : models.error ? (
                <Alert severity="error">{models.error.message}</Alert>
              ) : models.data.length === 0 ? (
                <Alert severity="warning">No AI models are configured on the server yet.</Alert>
              ) : (
                <ModelSelect models={models.data} value={modelId ?? ""} onChange={(id) => update({ modelId: id })} />
              )}
            </Field>
          </Stack>
        </CardContent>
      </Card>

      {start.error && <Alert severity="error">{start.error.message}</Alert>}

      <Stack direction="row" sx={{ justifyContent: "space-between" }}>
        <Button onClick={() => update({ step: 1 })}>Back</Button>
        <Button
          variant="contained"
          size="large"
          disabled={!modelId || start.isPending}
          onClick={() => start.mutate()}
          startIcon={start.isPending ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          Start interview
        </Button>
      </Stack>
    </Stack>
  );
}
