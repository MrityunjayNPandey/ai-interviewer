import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { botCheckHeaders } from "../../api/botCheck";
import { api } from "../../api/client";
import type { CandidateProfile, Match, RoleRequirements } from "../../api/types";
import BriefingCard from "./BriefingCard";
import { cleanProfile, cleanRequirements, type Draft } from "./draft";
import ProfileEditor from "./ProfileEditor";
import RequirementsEditor from "./RequirementsEditor";

type Props = { draft: Draft; update: (changes: Partial<Draft>) => void };

function MatchCard({ draft, update }: Props) {
  const refresh = useMutation({
    mutationFn: async () =>
      api.post<{ match: Match }>(
        "/setup/match",
        { profile: cleanProfile(draft.profile!), requirements: cleanRequirements(draft.requirements!) },
        await botCheckHeaders()
      ),
    onSuccess: ({ match }) => update({ match, matchStale: false }),
  });
  const { match } = draft;

  return (
    <Card sx={{ borderColor: "primary.main" }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <AutoAwesomeRounded color="primary" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            How you match
          </Typography>
          {(draft.matchStale || !match) && (
            <Button
              size="small"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              startIcon={refresh.isPending ? <CircularProgress size={14} /> : <RefreshRounded />}
            >
              {match ? "Update for your edits" : "Try again"}
            </Button>
          )}
        </Stack>
        {refresh.error && <Alert severity="error" sx={{ mb: 1 }}>{refresh.error.message}</Alert>}
        {match ? (
          <Box sx={{ opacity: draft.matchStale ? 0.6 : 1 }}>
            <Typography sx={{ mb: 1 }}>{match.summary}</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="success.main">
                  Where you're strong
                </Typography>
                <List dense disablePadding>
                  {match.strengths.map((item) => (
                    <ListItem key={item} disableGutters>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckRounded color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={item} />
                    </ListItem>
                  ))}
                </List>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="warning.main">
                  What to prepare for
                </Typography>
                <List dense disablePadding>
                  {match.gaps.map((item) => (
                    <ListItem key={item} disableGutters>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <TrendingUpRounded color="warning" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={item} />
                    </ListItem>
                  ))}
                </List>
              </Grid>
            </Grid>
          </Box>
        ) : (
          <Typography color="text.secondary">We couldn't compare your profile with the role this time.</Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReviewStep({ draft, update }: Props) {
  const profile = draft.profile!;
  const requirements = draft.requirements!;
  const setProfile = (next: CandidateProfile) => update({ profile: next, matchStale: true });
  const setRequirements = (next: RoleRequirements) => update({ requirements: next, matchStale: true });
  const canContinue = requirements.title.trim().length > 0;

  return (
    <Stack spacing={3}>
      <MatchCard draft={draft} update={update} />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ProfileEditor profile={profile} onChange={setProfile} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={3}>
            <RequirementsEditor requirements={requirements} onChange={setRequirements} />
            <BriefingCard draft={draft} update={update} />
          </Stack>
        </Grid>
      </Grid>
      <Stack direction="row" sx={{ justifyContent: "space-between" }}>
        <Button onClick={() => update({ step: 0 })}>Back</Button>
        <Button variant="contained" size="large" disabled={!canContinue} onClick={() => update({ step: 2 })}>
          Looks right, continue
        </Button>
      </Stack>
    </Stack>
  );
}
