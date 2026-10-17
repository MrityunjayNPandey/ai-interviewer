import FlagRounded from "@mui/icons-material/FlagRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { rememberInterview, useModels } from "../../api/queries";
import {
  DIFFICULTY_LABELS,
  INTERVIEW_TYPE_LABELS,
  MAX_ANSWER_CHARS,
  MODE_LABELS,
  type InterviewView,
} from "../../api/types";
import ErrorPanel from "./ErrorPanel";
import { AnswerBubble, Caret, FeedbackBubble, QuestionBubble } from "./Transcript";

type Action = "question" | "answer" | "feedback" | "end";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isConflict = (error: unknown) => error instanceof ApiError && error.code === "CONFLICT";

/** The unsent answer for a question, kept per tab so a refresh doesn't lose it. */
function useAnswerDraft(key: string) {
  const [value, setValue] = useState(() => {
    try {
      return sessionStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      setValue(sessionStorage.getItem(key) ?? "");
    } catch {
      setValue("");
    }
  }, [key]);
  const update = useCallback(
    (next: string) => {
      setValue(next);
      try {
        if (next) sessionStorage.setItem(key, next);
        else sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
    [key]
  );
  return [value, update] as const;
}

export default function InterviewRoom({ interview }: { interview: InterviewView }) {
  const queryClient = useQueryClient();
  const models = useModels();
  const { id, setup, turns } = interview;
  const last = turns.at(-1);
  const answeredCount = turns.filter((turn) => turn.answer).length;
  const coach = setup.mode === "coach";

  const [busy, setBusy] = useState<Action | null>(null);
  const [streamText, setStreamText] = useState("");
  const [sentAnswer, setSentAnswer] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ action: Action; error: Error } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [answer, setAnswer] = useAnswerDraft(`ai-interviewer.answer.${id}.${turns.length}`);
  const bottom = useRef<HTMLDivElement>(null);

  const waitingForAnswer = Boolean(last && !last.answer);
  const allAnswered = turns.length >= setup.length && Boolean(last?.answer);
  const feedbackMissing = coach && Boolean(last?.answer) && !last?.feedback;
  const modelLabel = models.data?.find((model) => model.id === setup.modelId)?.label ?? setup.modelId;

  const save = useCallback((next: InterviewView) => rememberInterview(queryClient, next), [queryClient]);

  /** Runs one step, streaming its text, and records a failure for the error panel. */
  const run = useCallback(
    async (action: Action, work: (onDelta: (text: string) => void) => Promise<InterviewView>) => {
      setBusy(action);
      setFailure(null);
      setStreamText("");
      try {
        const next = await work((text) => setStreamText((current) => current + text));
        save(next);
        return next;
      } catch (error) {
        setFailure({ action, error: error as Error });
        return null;
      } finally {
        setBusy(null);
        setStreamText("");
      }
    },
    [save]
  );

  const askQuestion = useCallback(
    () =>
      run("question", async (onDelta) => {
        // Another tab or an earlier request may still be generating it: wait for that one to land.
        for (let attempt = 0; ; attempt++) {
          try {
            return await api.stream(`/interviews/${id}/questions`, {}, onDelta);
          } catch (error) {
            if (!isConflict(error) || attempt >= 20) throw error;
            await sleep(2500);
            const { interview: latest } = await api.get<{ interview: InterviewView }>(`/interviews/${id}`);
            const waiting = latest.turns.at(-1);
            if (latest.status !== "in_progress" || (waiting && !waiting.answer)) return latest;
          }
        }
      }),
    [id, run]
  );

  const submitAnswer = async () => {
    const text = answer.trim();
    if (!text) return;
    setSentAnswer(text);
    const next = await run("answer", (onDelta) => api.stream(`/interviews/${id}/answers`, { answer: text }, onDelta));
    setSentAnswer(null);
    if (next) setAnswer("");
  };

  const retryFeedback = () => run("feedback", (onDelta) => api.stream(`/interviews/${id}/feedback`, {}, onDelta));

  const end = () => {
    setConfirmEnd(false);
    void run("end", async () => (await api.post<{ interview: InterviewView }>(`/interviews/${id}/end`)).interview);
  };

  const retry = (action: Action) => {
    if (action === "question") void askQuestion();
    else if (action === "answer") void submitAnswer();
    else if (action === "feedback") void retryFeedback();
    else end();
  };

  const switchModel = async (modelId: string) => {
    if (!failure) return;
    const action = failure.action;
    try {
      save((await api.put<{ interview: InterviewView }>(`/interviews/${id}/model`, { modelId })).interview);
    } catch (error) {
      setFailure({ action, error: error as Error });
      return;
    }
    retry(action);
  };

  // Ask automatically at the start, and between questions in mock mode (like a real interview).
  const autoAskedAt = useRef<number | null>(null);
  const shouldAutoAsk =
    interview.status === "in_progress" &&
    !busy &&
    !failure &&
    turns.length < setup.length &&
    (turns.length === 0 || (!coach && Boolean(last?.answer)));
  useEffect(() => {
    if (shouldAutoAsk && autoAskedAt.current !== turns.length) {
      autoAskedAt.current = turns.length;
      void askQuestion();
    }
  }, [shouldAutoAsk, turns.length, askQuestion]);

  const streaming = streamText.length > 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, streaming, busy, sentAnswer]);

  // The question on screen: the one streaming in, the one waiting for an answer, or the last one answered.
  const currentNumber = busy === "question" ? turns.length + 1 : waitingForAnswer ? turns.length : answeredCount;

  return (
    <Stack spacing={3} sx={{ maxWidth: 860, mx: "auto" }}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}>
            <Box>
              <Typography variant="h5" component="h1">
                {setup.requirements.title}
                {setup.requirements.company ? ` · ${setup.requirements.company}` : ""}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                <Chip size="small" label={INTERVIEW_TYPE_LABELS[setup.interviewType]} />
                <Chip size="small" label={DIFFICULTY_LABELS[setup.difficulty]} />
                <Chip size="small" label={`${MODE_LABELS[setup.mode].label} mode`} />
                <Chip size="small" variant="outlined" label={modelLabel} />
              </Stack>
            </Box>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<FlagRounded />}
              disabled={!answeredCount || busy !== null}
              onClick={() => (allAnswered ? end() : setConfirmEnd(true))}
              sx={{ flexShrink: 0 }}
            >
              End interview
            </Button>
          </Stack>
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {currentNumber ? `Question ${currentNumber} of ${setup.length}` : `${setup.length} questions`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {answeredCount} answered
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={(answeredCount / setup.length) * 100} sx={{ height: 8, borderRadius: 4 }} />
          </Box>
        </CardContent>
      </Card>

      <Stack spacing={2.5} aria-live="polite">
        {turns.map((turn) => (
          <Stack key={turn.index} spacing={2}>
            <QuestionBubble index={turn.index}>{turn.question}</QuestionBubble>
            {turn.answer && <AnswerBubble>{turn.answer}</AnswerBubble>}
            {coach && turn.feedback && <FeedbackBubble>{turn.feedback}</FeedbackBubble>}
          </Stack>
        ))}

        {busy === "question" && (
          <QuestionBubble index={turns.length}>
            {streamText || <Typography component="span" color="text.secondary">Thinking of a question…</Typography>}
            <Caret />
          </QuestionBubble>
        )}
        {busy === "answer" && sentAnswer && <AnswerBubble>{sentAnswer}</AnswerBubble>}
        {(busy === "answer" || busy === "feedback") && coach && (
          <FeedbackBubble>
            {streamText || "Reviewing your answer…"}
            <Caret />
          </FeedbackBubble>
        )}
        {busy === "answer" && !coach && (
          <Typography color="text.secondary" sx={{ textAlign: "center" }}>
            Answer saved.
          </Typography>
        )}
      </Stack>

      {busy === "end" && (
        <Card>
          <CardContent>
            <Stack spacing={1.5} sx={{ alignItems: "center", py: 2 }}>
              <CircularProgress />
              <Typography>Writing your report…</Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {failure && (
        <ErrorPanel
          error={failure.error}
          currentModelId={setup.modelId}
          busy={busy !== null}
          onRetry={() => retry(failure.action)}
          onSwitchModel={(modelId) => void switchModel(modelId)}
        />
      )}

      {waitingForAnswer && busy !== "answer" && (
        <Card>
          <CardContent>
            <TextField
              label="Your answer"
              multiline
              minRows={5}
              maxRows={16}
              value={answer}
              onChange={(event) => setAnswer(event.target.value.slice(0, MAX_ANSWER_CHARS))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submitAnswer();
              }}
              placeholder="Answer as you would out loud. Specific examples and results make the strongest answers."
              autoFocus
            />
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {answer.length > MAX_ANSWER_CHARS * 0.9 ? `${answer.length}/${MAX_ANSWER_CHARS}` : "Ctrl + Enter to send"}
              </Typography>
              <Button variant="contained" endIcon={<SendRounded />} disabled={!answer.trim() || busy !== null} onClick={() => void submitAnswer()}>
                Submit answer
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {!busy && !failure && !waitingForAnswer && last?.answer && (
        <Stack direction="row" spacing={2} sx={{ justifyContent: "center" }}>
          {feedbackMissing && (
            <Button onClick={() => void retryFeedback()}>Get feedback on this answer</Button>
          )}
          {allAnswered ? (
            <Button variant="contained" size="large" onClick={end}>
              Finish and see my report
            </Button>
          ) : (
            coach && (
              <Button variant="contained" size="large" onClick={() => void askQuestion()}>
                Next question
              </Button>
            )
          )}
        </Stack>
      )}

      {!coach && interview.status === "in_progress" && (
        <Alert severity="info" variant="outlined">
          Mock mode: feedback on each answer is saved for your report.
        </Alert>
      )}

      <div ref={bottom} />

      <Dialog open={confirmEnd} onClose={() => setConfirmEnd(false)}>
        <DialogTitle>End the interview now?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You've answered {answeredCount} of {setup.length} questions. Your report will cover only those
            {waitingForAnswer ? ", and the current unanswered question will be dropped" : ""}.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmEnd(false)}>Keep going</Button>
          <Button variant="contained" onClick={end}>
            End and see report
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
