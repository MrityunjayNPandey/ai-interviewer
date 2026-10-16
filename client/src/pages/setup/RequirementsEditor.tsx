import { Box, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import type { RoleRequirements } from "../../api/types";
import { ChipsField, LinesField } from "../../components/ListFields";

type Props = { requirements: RoleRequirements; onChange: (requirements: RoleRequirements) => void };

export default function RequirementsEditor({ requirements, onChange }: Props) {
  const set = (changes: Partial<RoleRequirements>) => onChange({ ...requirements, ...changes });

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6">The role</Typography>
            <Typography variant="body2" color="text.secondary">
              From the job description. Questions are pitched at these requirements.
            </Typography>
          </Box>
          <TextField
            label="Job title"
            required
            value={requirements.title}
            onChange={(e) => set({ title: e.target.value })}
            error={!requirements.title.trim()}
            helperText={requirements.title.trim() ? undefined : "Add the job title"}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Company" value={requirements.company ?? ""} onChange={(e) => set({ company: e.target.value })} />
            <TextField label="Seniority" value={requirements.seniority ?? ""} onChange={(e) => set({ seniority: e.target.value })} />
          </Stack>
          <ChipsField label="Must-have" values={requirements.mustHave} onChange={(mustHave) => set({ mustHave })} />
          <ChipsField label="Nice-to-have" values={requirements.niceToHave} onChange={(niceToHave) => set({ niceToHave })} />
          <LinesField
            label="Responsibilities"
            values={requirements.responsibilities}
            onChange={(responsibilities) => set({ responsibilities })}
            addLabel="Add responsibility"
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
