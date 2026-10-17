import PersonRounded from "@mui/icons-material/PersonRounded";
import SchoolRounded from "@mui/icons-material/SchoolRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import { Avatar, Box, Paper, Stack, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { Fragment, type ReactNode } from "react";
import type { TurnView } from "../../api/types";

const blink = keyframes`50% { opacity: 0; }`;

/** A blinking caret shown at the end of text that is still streaming. */
export function Caret() {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ display: "inline-block", width: "0.5em", height: "1em", ml: 0.25, mb: "-0.15em", bgcolor: "text.primary", animation: `${blink} 1s step-end infinite` }}
    />
  );
}

function Bubble({
  avatar,
  name,
  align,
  tone,
  children,
}: {
  avatar: ReactNode;
  name: string;
  align: "left" | "right";
  tone: "interviewer" | "candidate" | "coach" | "candidateToCoach";
  children: ReactNode;
}) {
  const colors = {
    interviewer: { bgcolor: "background.paper", borderColor: "divider" },
    candidate: { bgcolor: "primary.main", color: "primary.contrastText", borderColor: "primary.main" },
    coach: { bgcolor: "action.hover", borderColor: "secondary.main" },
    candidateToCoach: { bgcolor: "action.selected", borderColor: "divider" },
  }[tone];
  return (
    <Stack direction={align === "right" ? "row-reverse" : "row"} spacing={1.5} sx={{ alignItems: "flex-start" }}>
      <Avatar
        sx={{
          width: 36,
          height: 36,
          bgcolor: tone === "coach" ? "secondary.main" : tone === "interviewer" ? "grey.700" : "primary.main",
        }}
      >
        {avatar}
      </Avatar>
      <Box sx={{ maxWidth: { xs: "85%", md: "75%" } }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, textAlign: align }}>
          {name}
        </Typography>
        <Paper variant="outlined" sx={{ px: 2, py: 1.5, borderRadius: 3, whiteSpace: "pre-wrap", ...colors }}>
          {children}
        </Paper>
      </Box>
    </Stack>
  );
}

export const QuestionBubble = ({ index, children }: { index: number; children: ReactNode }) => (
  <Bubble avatar={<SmartToyRounded fontSize="small" />} name={`Interviewer · Question ${index + 1}`} align="left" tone="interviewer">
    <Typography sx={{ fontSize: "1.05rem" }}>{children}</Typography>
  </Bubble>
);

export const AnswerBubble = ({ label = "You", children }: { label?: string; children: ReactNode }) => (
  <Bubble avatar={<PersonRounded fontSize="small" />} name={label} align="right" tone="candidate">
    <Typography>{children}</Typography>
  </Bubble>
);

export const CoachQuestionBubble = ({ children }: { children: ReactNode }) => (
  <Bubble avatar={<PersonRounded fontSize="small" />} name="You · to the coach" align="right" tone="candidateToCoach">
    <Typography variant="body2" sx={{ fontSize: "0.95rem" }}>
      {children}
    </Typography>
  </Bubble>
);

export const FeedbackBubble = ({ children }: { children: ReactNode }) => (
  <Bubble avatar={<SchoolRounded fontSize="small" />} name="Coach" align="left" tone="coach">
    <Typography variant="body2" sx={{ fontSize: "0.95rem" }}>
      {children}
    </Typography>
  </Bubble>
);

/** One question with every attempt at it, each attempt's feedback, and the coach chat that followed it. */
export function TurnTranscript({ turn, showCoaching }: { turn: TurnView; showCoaching: boolean }) {
  const attempts = [...turn.previousAttempts, ...(turn.answer ? [{ answer: turn.answer, feedback: turn.feedback }] : [])];
  const numbered = turn.previousAttempts.length > 0;
  return (
    <Stack spacing={2}>
      <QuestionBubble index={turn.index}>{turn.question}</QuestionBubble>
      {attempts.map((attempt, index) => (
        <Fragment key={index}>
          <AnswerBubble label={numbered ? `You · Attempt ${index + 1}` : "You"}>{attempt.answer}</AnswerBubble>
          {showCoaching && attempt.feedback && <FeedbackBubble>{attempt.feedback}</FeedbackBubble>}
          {showCoaching &&
            turn.coachMessages
              .filter((message) => message.attempt === index)
              .map((message, i) =>
                message.role === "candidate" ? (
                  <CoachQuestionBubble key={i}>{message.content}</CoachQuestionBubble>
                ) : (
                  <FeedbackBubble key={i}>{message.content}</FeedbackBubble>
                )
              )}
        </Fragment>
      ))}
    </Stack>
  );
}
