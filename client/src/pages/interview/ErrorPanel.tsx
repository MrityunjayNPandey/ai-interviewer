import { Alert, AlertTitle, Box, Button, Stack } from "@mui/material";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { useModels } from "../../api/queries";
import ModelSelect from "../../components/ModelSelect";

type Props = {
  error: Error;
  currentModelId: string;
  onRetry: () => void;
  /** Switches the interview to another model, then retries. */
  onSwitchModel: (modelId: string) => void;
  busy: boolean;
};

/** Shows a failed step with a retry button and, when the model is the problem, a model switcher. */
export default function ErrorPanel({ error, currentModelId, onRetry, onSwitchModel, busy }: Props) {
  const modelProblem = error instanceof ApiError && error.code === "MODEL_UNAVAILABLE";
  const models = useModels();
  const alternatives = models.data?.filter((model) => model.id !== currentModelId) ?? [];
  const [choice, setChoice] = useState("");

  return (
    <Alert severity={modelProblem ? "warning" : "error"} sx={{ "& .MuiAlert-message": { width: "100%" } }}>
      <AlertTitle>{modelProblem ? "The model is busy" : "Something went wrong"}</AlertTitle>
      {error.message}
      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
        <Box>
          <Button variant="outlined" color="inherit" size="small" onClick={onRetry} disabled={busy}>
            Try again
          </Button>
        </Box>
        {modelProblem && alternatives.length > 0 && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
            <Box sx={{ flexGrow: 1, maxWidth: 420 }}>
              <ModelSelect models={alternatives} value={choice} onChange={setChoice} label="Or switch to" />
            </Box>
            <Button variant="contained" size="small" disabled={!choice || busy} onClick={() => onSwitchModel(choice)}>
              Switch and continue
            </Button>
          </Stack>
        )}
      </Stack>
    </Alert>
  );
}
