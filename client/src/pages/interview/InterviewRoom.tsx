import FlagRounded from "@mui/icons-material/FlagRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
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
  MAX_COACH_MESSAGE_CHARS,
  MAX_COACH_MESSAGES,
  MAX_RETRIES,
  MODE_LABELS,
  type InterviewView,
} from "../../api/types";
import ErrorPanel from "./ErrorPanel";
import { AnswerBubble, Caret, CoachQuestionBubble, FeedbackBubble, QuestionBubble, TurnTranscript } from "./Transcript";

type Action = "question" | "answer" | "feedback" | "coach" | "retry" | "end";

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
  // A question reopened for another attempt still counts: its earlier attempt stands until replaced.
  const answeredCount = turns.filter((turn) => turn.answer || turn.previousAttempts.length).length;
  const coach = setup.mode === "coach";

  const [busy, setBusy] = useState<Action | null>(null);
  const [streamText, setStreamText] = useState("");
  const [sentAnswer, setSentAnswer] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ action: Action; error: Error } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [coachDraft, setCoachDraft] = useState("");
  const [sentCoachMessage, setSentCoachMessage] = useState<string | null>(null);
  const [answer, setAnswer] = useAnswerDraft(`ai-interviewer.answer.${id}.${turns.length}`);
  const bottom = useRef<HTMLDivElement>(null);

  const waitingForAnswer = Boolean(last && !last.answer);
  const allAnswered = turns.length >= setup.length && Boolean(last?.answer);
  const feedbackMissing = coach && Boolean(last?.answer) && !last?.feedback;
  const coachQuestionsLeft = MAX_COACH_MESSAGES - (last?.coachMessages.filter((m) => m.role === "candidate").length ?? 0);
  const retriesLeft = MAX_RETRIES - (last?.previousAttempts.length ?? 0);
  const canCoach = coach && Boolean(last?.answer && last.feedback);
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

  const askCoach = async (message = coachDraft.trim()) => {
    if (!message) return;
    setSentCoachMessage(message);
    const next = await run("coach", (onDelta) => api.stream(`/interviews/${id}/coach`, { message }, onDelta));
    if (next) {
      setSentCoachMessage(null);
      setCoachDraft("");
    }
  };

  const answerAgain = () =>
    run("retry", async () => (await api.post<{ interview: InterviewView }>(`/interviews/${id}/retry`)).interview);

  const end = () => {
    setConfirmEnd(false);
    void run("end", async () => (await api.post<{ interview: InterviewView }>(`/interviews/${id}/end`)).interview);
  };

  const retry = (action: Action) => {
    if (action === "question") void askQuestion();
    else if (action === "answer") void submitAnswer();
    else if (action === "feedback") void retryFeedback();
    else if (action === "coach") void askCoach(sentCoachMessage ?? undefined);
    else if (action === "retry") void answerAgain();
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
  }, [turns.length, streaming, busy, sentAnswer, last?.coachMessages.length]);

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
          <TurnTranscript key={turn.index} turn={turn} showCoaching={coach} />
        ))}

        {busy === "question" && (
          <QuestionBubble index={turns.length}>
            {streamText || <Typography component="span" color="text.secondary">Thinking of a question…</Typography>}
            <Caret />
          </QuestionBubble>
        )}
        {busy === "answer" && sentAnswer && (
          <AnswerBubble label={last?.previousAttempts.length ? `You · Attempt ${last.previousAttempts.length + 1}` : "You"}>
            {sentAnswer}
          </AnswerBubble>
        )}
        {busy === "coach" && sentCoachMessage && (
          <>
            <CoachQuestionBubble>{sentCoachMessage}</CoachQuestionBubble>
            <FeedbackBubble>
              {streamText || "Thinking…"}
              <Caret />
            </FeedbackBubble>
          </>
        )}
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
              placeholder={
                last?.previousAttempts.length
                  ? "Try again, using the feedback. Your best attempt counts in the report."
                  : "Answer as you would out loud. Specific examples and results make the strongest answers."
              }
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

      {canCoach && !busy && (
        <Card variant="outlined" sx={{ borderColor: "secondary.main" }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Ask the coach about this feedback
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "flex-start" } }}>
              <TextField
                size="small"
                multiline
                maxRows={6}
                value={coachDraft}
                disabled={coachQuestionsLeft <= 0}
                onChange={(event) => setCoachDraft(event.target.value.slice(0, MAX_COACH_MESSAGE_CHARS))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void askCoach();
                  }
                }}
                placeholder={
                  coachQuestionsLeft > 0
                    ? "e.g. What would a strong answer sound like?"
                    : "You've used all your coach questions for this one"
                }
                slotProps={{ htmlInput: { "aria-label": "Message to the coach" } }}
              />
              <Button
                variant="outlined"
                color="secondary"
                endIcon={<SendRounded />}
                disabled={!coachDraft.trim() || coachQuestionsLeft <= 0}
                onClick={() => void askCoach()}
                sx={{ flexShrink: 0 }}
              >
                Ask
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {coachQuestionsLeft} of {MAX_COACH_MESSAGES} questions left. The interviewer doesn't see this chat, and it isn't scored.
            </Typography>
          </CardContent>
        </Card>
      )}

      {!busy && !failure && !waitingForAnswer && last?.answer && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "center", alignItems: "center" }}>
          {feedbackMissing && (
            <Button onClick={() => void retryFeedback()}>Get feedback on this answer</Button>
          )}
          {coach && retriesLeft > 0 && (
            <Button variant="outlined" size="large" startIcon={<ReplayRounded />} onClick={() => void answerAgain()}>
              Try answering again ({retriesLeft} left)
            </Button>
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
