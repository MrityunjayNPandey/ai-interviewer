import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { Alert, FormControl, InputLabel, ListItemText, MenuItem, Select, Stack } from "@mui/material";
import { useId } from "react";
import type { ModelOption } from "../api/types";

/** Picks the interviewer model, showing each model's provider and strengths, and the training caveat. */
export default function ModelSelect({
  models,
  value,
  onChange,
  label = "Model",
}: {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const selected = models.find((model) => model.id === value);
  const labelId = useId();
  return (
    <Stack spacing={1}>
      <FormControl fullWidth>
        <InputLabel id={labelId}>{label}</InputLabel>
        <Select
          labelId={labelId}
          label={label}
          value={selected ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          renderValue={(id) => {
            const model = models.find((m) => m.id === id);
            return model ? `${model.label} · ${model.provider}` : "";
          }}
        >
          {models.map((model) => (
            <MenuItem key={model.id} value={model.id}>
              <ListItemText
                primary={`${model.label}${model.isDefault ? " (recommended)" : ""}`}
                secondary={`${model.provider} · ${model.note}${model.mayTrainOnInputs ? " · may train on your inputs" : ""}`}
              />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {selected?.mayTrainOnInputs && (
        <Alert severity="info" icon={<InfoOutlined fontSize="inherit" />}>
          {selected.provider}'s free tier may use your inputs (your profile and answers) to train its models.
        </Alert>
      )}
    </Stack>
  );
}
