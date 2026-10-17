import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";

/** Score bands. The color always comes with an icon and a label, never alone. */
function scoreBand(score: number) {
  if (score >= 8) return { label: "Strong", color: "success" as const, icon: <CheckCircleRounded /> };
  if (score >= 5) return { label: "Getting there", color: "warning" as const, icon: <TrendingUpRounded /> };
  return { label: "Needs work", color: "error" as const, icon: <ErrorOutlineRounded /> };
}

export function ScoreChip({ score, size = "small" }: { score: number; size?: "small" | "medium" }) {
  const band = scoreBand(score);
  return (
    <Chip
      size={size}
      variant="outlined"
      color={band.color}
      icon={band.icon}
      label={`${score}/10 · ${band.label}`}
      sx={{ fontWeight: 600, "& .MuiChip-label": { color: "text.primary" } }}
    />
  );
}

/** A score against its maximum: a single-hue track and fill. */
export function ScoreMeter({ score, height = 10 }: { score: number; height?: number }) {
  return (
    <Box
      role="meter"
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={score}
      aria-label={`Score ${score} out of 10`}
      sx={{ position: "relative", height, borderRadius: height, bgcolor: "action.selected", overflow: "hidden" }}
    >
      <Box sx={{ width: `${score * 10}%`, height: "100%", borderRadius: height, bgcolor: "primary.main", transition: "width 600ms ease" }} />
    </Box>
  );
}

/** Per-question scores as labelled bars; hovering a bar shows its question. */
export function ScoresByQuestion({ scores }: { scores: { index: number; score: number; question: string }[] }) {
  return (
    <Stack spacing={1} component="ol" sx={{ listStyle: "none", p: 0, m: 0 }} aria-label="Score for each question">
      {scores.map(({ index, score, question }) => (
        <Tooltip key={index} title={question} placement="top-start" arrow>
          <Stack
            component="li"
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", py: 0.5, borderRadius: 1, cursor: "default", "&:hover": { bgcolor: "action.hover" } }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ width: 28, flexShrink: 0, textAlign: "right" }}>
              Q{index + 1}
            </Typography>
            <Box sx={{ flexGrow: 1 }}>
              <ScoreMeter score={score} height={12} />
            </Box>
            <Typography variant="body2" sx={{ width: 40, flexShrink: 0, fontWeight: 600 }}>
              {score}
            </Typography>
          </Stack>
        </Tooltip>
      ))}
    </Stack>
  );
}
