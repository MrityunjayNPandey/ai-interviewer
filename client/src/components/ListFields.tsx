import AddRounded from "@mui/icons-material/AddRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { Autocomplete, Box, Button, Chip, IconButton, Stack, TextField, Typography } from "@mui/material";

/** Short items (skills, requirements) as removable chips; type and press Enter to add. */
export function ChipsField({
  label,
  values,
  onChange,
  placeholder = "Type and press Enter",
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  return (
    <Autocomplete
      multiple
      freeSolo
      options={[]}
      value={values}
      onChange={(_event, next) => onChange(dedupe(next.flatMap(splitPasted)))}
      renderValue={(items, getItemProps) =>
        items.map((item, index) => {
          const { key, ...props } = getItemProps({ index });
          return <Chip key={key} label={item} size="small" {...props} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={values.length ? undefined : placeholder} />
      )}
    />
  );
}

const splitPasted = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

const dedupe = (values: string[]) => [...new Set(values)];

/** Longer items (highlights, responsibilities) as an editable list of lines. */
export function LinesField({
  label,
  values,
  onChange,
  addLabel = "Add",
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  addLabel?: string;
}) {
  const update = (index: number, value: string) => onChange(values.map((item, i) => (i === index ? value : item)));
  const remove = (index: number) => onChange(values.filter((_, i) => i !== index));

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        {label}
      </Typography>
      <Stack spacing={1}>
        {values.map((value, index) => (
          <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <TextField
              size="small"
              multiline
              value={value}
              onChange={(event) => update(index, event.target.value)}
              slotProps={{ htmlInput: { "aria-label": `${label} ${index + 1}` } }}
            />
            <IconButton size="small" onClick={() => remove(index)} aria-label={`Remove ${label} ${index + 1}`} sx={{ mt: 0.5 }}>
              <CloseRounded fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Box>
          <Button size="small" startIcon={<AddRounded />} onClick={() => onChange([...values, ""])}>
            {addLabel}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
