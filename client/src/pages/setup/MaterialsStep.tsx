import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { botCheckHeaders } from "../../api/botCheck";
import { api } from "../../api/client";
import { MAX_PDF_BYTES, type CandidateProfile, type Match, type RoleRequirements } from "../../api/types";
import type { Draft } from "./draft";

type Props = { draft: Draft; update: (changes: Partial<Draft>) => void };

export default function MaterialsStep({ draft, update }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showText, setShowText] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const extract = useMutation({
    mutationFn: (file: File) => api.upload<{ text: string }>("/setup/resume-text", file),
    onSuccess: ({ text }, file) => update({ resumeText: text, resumeFileName: file.name }),
  });

  const analyze = useMutation({
    mutationFn: async () => {
      const parsed = await api.post<{ profile: CandidateProfile; requirements: RoleRequirements }>(
        "/setup/parse",
        { resumeText: draft.resumeText, jobDescription: draft.jobDescription },
        await botCheckHeaders()
      );
      // The match is a nice-to-have: if it fails, the review step offers a retry.
      const match = await api
        .post<{ match: Match }>("/setup/match", parsed)
        .then((res) => res.match)
        .catch(() => null);
      return { ...parsed, match };
    },
    onSuccess: ({ profile, requirements, match }) =>
      update({
        profile,
        requirements,
        match,
        matchStale: false,
        parsedFrom: { resumeText: draft.resumeText, jobDescription: draft.jobDescription },
        step: 1,
      }),
  });

  const pickFile = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setFileError("Please choose a PDF file, or paste your resume as text.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setFileError("That file is over 4 MB. Try a smaller PDF, or paste your resume as text.");
      return;
    }
    extract.mutate(new File([file], file.name, { type: "application/pdf" }));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files[0]);
  };

  const unchanged =
    draft.parsedFrom?.resumeText === draft.resumeText && draft.parsedFrom.jobDescription === draft.jobDescription;
  const canAnalyze = draft.resumeText.trim() && draft.jobDescription.trim() && !extract.isPending;

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Your resume
          </Typography>
          <Tabs
            value={draft.resumeSource}
            onChange={(_event, value: Draft["resumeSource"]) => update({ resumeSource: value })}
            sx={{ mb: 2 }}
          >
            <Tab value="upload" label="Upload PDF" />
            <Tab value="paste" label="Paste text" />
          </Tabs>

          {draft.resumeSource === "upload" ? (
            <Stack spacing={2}>
              <Box
                role="button"
                tabIndex={0}
                aria-label="Upload your resume as a PDF"
                onClick={() => fileInput.current?.click()}
                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && fileInput.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                sx={{
                  border: 2,
                  borderStyle: "dashed",
                  borderColor: dragging ? "primary.main" : "divider",
                  bgcolor: dragging ? "action.hover" : "transparent",
                  borderRadius: 2,
                  p: 4,
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "border-color 120ms, background-color 120ms",
                  "&:hover, &:focus-visible": { borderColor: "primary.main", outline: "none" },
                }}
              >
                {extract.isPending ? (
                  <Stack spacing={1} sx={{ alignItems: "center" }}>
                    <CircularProgress size={28} />
                    <Typography>Reading your resume…</Typography>
                  </Stack>
                ) : draft.resumeFileName && draft.resumeText ? (
                  <Stack spacing={0.5} sx={{ alignItems: "center" }}>
                    <CheckCircleRounded color="success" />
                    <Typography sx={{ fontWeight: 600 }}>{draft.resumeFileName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Click or drop another PDF to replace it
                    </Typography>
                  </Stack>
                ) : (
                  <Stack spacing={0.5} sx={{ alignItems: "center" }}>
                    <UploadFileRounded color="primary" fontSize="large" />
                    <Typography sx={{ fontWeight: 600 }}>Drop your resume here, or click to choose</Typography>
                    <Typography variant="body2" color="text.secondary">
                      PDF up to 4 MB. We keep the text and discard the file.
                    </Typography>
                  </Stack>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(event) => {
                    pickFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </Box>
              {(fileError || extract.error) && (
                <Alert severity="error">{fileError ?? extract.error?.message}</Alert>
              )}
              {draft.resumeFileName && draft.resumeText && (
                <Box>
                  <Link component="button" type="button" onClick={() => setShowText((shown) => !shown)}>
                    {showText ? "Hide the extracted text" : "Check the extracted text"}
                  </Link>
                  <Collapse in={showText}>
                    <TextField
                      multiline
                      minRows={6}
                      maxRows={16}
                      value={draft.resumeText}
                      onChange={(event) => update({ resumeText: event.target.value })}
                      sx={{ mt: 1 }}
                      slotProps={{ htmlInput: { "aria-label": "Extracted resume text" } }}
                    />
                  </Collapse>
                </Box>
              )}
            </Stack>
          ) : (
            <TextField
              label="Resume"
              multiline
              minRows={8}
              maxRows={20}
              value={draft.resumeText}
              onChange={(event) => update({ resumeText: event.target.value, resumeFileName: null })}
              placeholder="Paste the text of your resume"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            The job
          </Typography>
          <TextField
            label="Job description"
            multiline
            minRows={8}
            maxRows={20}
            value={draft.jobDescription}
            onChange={(event) => update({ jobDescription: event.target.value })}
            placeholder="Paste the full job description, including requirements and responsibilities"
          />
        </CardContent>
      </Card>

      {analyze.error && <Alert severity="error">{analyze.error.message}</Alert>}

      <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end" }}>
        {unchanged && draft.profile && (
          <Button onClick={() => update({ step: 1 })}>Back to review</Button>
        )}
        <Button
          variant="contained"
          size="large"
          disabled={!canAnalyze || analyze.isPending}
          onClick={() => analyze.mutate()}
          startIcon={analyze.isPending ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {analyze.isPending ? "Analysing…" : unchanged && draft.profile ? "Analyse again" : "Analyse"}
        </Button>
      </Stack>
    </Stack>
  );
}
