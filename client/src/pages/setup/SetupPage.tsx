import { Box, Step, StepLabel, Stepper, Typography } from "@mui/material";
import { useDraft } from "./draft";
import MaterialsStep from "./MaterialsStep";
import ReviewStep from "./ReviewStep";
import SettingsStep from "./SettingsStep";

const STEPS = ["Resume & job", "Review", "Interview settings"];

export default function SetupPage() {
  const { draft, update, reset } = useDraft();
  // A draft can only be on a later step if its earlier steps produced data.
  const step = draft.profile && draft.requirements ? draft.step : 0;

  return (
    <Box sx={{ maxWidth: 960, mx: "auto" }}>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
        New practice interview
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Tell us about you and the role. It takes about a minute.
      </Typography>

      <Stepper activeStep={step} alternativeLabel sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {step === 0 && <MaterialsStep draft={draft} update={update} />}
      {step === 1 && <ReviewStep draft={draft} update={update} />}
      {step === 2 && <SettingsStep draft={draft} update={update} reset={reset} />}
    </Box>
  );
}
