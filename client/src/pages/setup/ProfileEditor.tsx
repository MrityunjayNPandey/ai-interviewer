import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import { Box, Button, Card, CardContent, Divider, Grid, IconButton, Stack, TextField, Typography } from "@mui/material";
import type { CandidateProfile } from "../../api/types";
import { ChipsField, LinesField } from "../../components/ListFields";

type Props = { profile: CandidateProfile; onChange: (profile: CandidateProfile) => void };

export default function ProfileEditor({ profile, onChange }: Props) {
  const set = (changes: Partial<CandidateProfile>) => onChange({ ...profile, ...changes });
  const setExperience = (index: number, changes: Partial<CandidateProfile["experience"][number]>) =>
    set({ experience: profile.experience.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)) });
  const setProject = (index: number, changes: Partial<CandidateProfile["projects"][number]>) =>
    set({ projects: profile.projects.map((project, i) => (i === index ? { ...project, ...changes } : project)) });

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6">Your profile</Typography>
            <Typography variant="body2" color="text.secondary">
              From your resume. The interviewer only knows what's here, so fix anything that's wrong or missing.
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Name" value={profile.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Years of experience"
                type="number"
                value={profile.yearsOfExperience ?? ""}
                onChange={(e) => set({ yearsOfExperience: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                slotProps={{ htmlInput: { min: 0, max: 60 } }}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Current role"
                value={profile.headline ?? ""}
                onChange={(e) => set({ headline: e.target.value })}
              />
            </Grid>
          </Grid>

          <ChipsField label="Skills" values={profile.skills} onChange={(skills) => set({ skills })} />

          <Divider />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Experience
          </Typography>
          {profile.experience.map((entry, index) => (
            <Box key={index} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" label="Title" value={entry.title} onChange={(e) => setExperience(index, { title: e.target.value })} />
                  <IconButton
                    aria-label={`Remove ${entry.title || "experience"}`}
                    onClick={() => set({ experience: profile.experience.filter((_, i) => i !== index) })}
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Company" value={entry.company ?? ""} onChange={(e) => setExperience(index, { company: e.target.value })} />
                  <TextField size="small" label="Period" value={entry.period ?? ""} onChange={(e) => setExperience(index, { period: e.target.value })} />
                </Stack>
                <LinesField
                  label="Highlights"
                  values={entry.highlights}
                  onChange={(highlights) => setExperience(index, { highlights })}
                  addLabel="Add highlight"
                />
              </Stack>
            </Box>
          ))}
          <Box>
            <Button
              startIcon={<AddRounded />}
              onClick={() => set({ experience: [...profile.experience, { title: "", company: null, period: null, highlights: [] }] })}
            >
              Add experience
            </Button>
          </Box>

          <Divider />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Projects
          </Typography>
          {profile.projects.map((project, index) => (
            <Box key={index} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" label="Project" value={project.name} onChange={(e) => setProject(index, { name: e.target.value })} />
                  <IconButton
                    aria-label={`Remove ${project.name || "project"}`}
                    onClick={() => set({ projects: profile.projects.filter((_, i) => i !== index) })}
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                </Stack>
                <LinesField
                  label="Highlights"
                  values={project.highlights}
                  onChange={(highlights) => setProject(index, { highlights })}
                  addLabel="Add highlight"
                />
              </Stack>
            </Box>
          ))}
          <Box>
            <Button startIcon={<AddRounded />} onClick={() => set({ projects: [...profile.projects, { name: "", highlights: [] }] })}>
              Add project
            </Button>
          </Box>

          <Divider />
          <LinesField label="Education" values={profile.education} onChange={(education) => set({ education })} addLabel="Add education" />
        </Stack>
      </CardContent>
    </Card>
  );
}
