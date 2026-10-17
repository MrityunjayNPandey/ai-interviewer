import CloseRounded from "@mui/icons-material/CloseRounded";
import PublicRounded from "@mui/icons-material/PublicRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Link,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, ApiError } from "../../api/client";
import type { BriefingItem, RoleBriefing } from "../../api/types";
import { briefingSubjectKey, cleanRequirements, type Draft } from "./draft";

type Props = { draft: Draft; update: (changes: Partial<Draft>) => void };
type Section = "about" | "process" | "questions" | "topics";

const SECTIONS: { key: Section; title: string }[] = [
  { key: "about", title: "About the company" },
  { key: "process", title: "Interview process" },
  { key: "questions", title: "Commonly asked questions" },
  { key: "topics", title: "Topics to prepare" },
];

const domain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function SourceLinks({ ids, briefing }: { ids: number[]; briefing: RoleBriefing }) {
  return (
    <Box component="span" sx={{ ml: 0.5, whiteSpace: "nowrap" }}>
      {ids.map((id) => {
        const source = briefing.sources.find((entry) => entry.id === id);
        if (!source) return null;
        return (
          <Tooltip key={id} title={`${source.title} · ${domain(source.url)}`}>
            <Link
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="caption"
              sx={{ mx: 0.25, verticalAlign: "super", fontWeight: 600 }}
              aria-label={`Source ${id}: ${source.title}`}
            >
              [{id}]
            </Link>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function Points({
  items,
  briefing,
  onRemove,
}: {
  items: BriefingItem[];
  briefing: RoleBriefing;
  onRemove: (index: number) => void;
}) {
  return (
    <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", p: 0, m: 0 }}>
      {items.map((item, index) => (
        <Stack
          component="li"
          key={`${index}-${item.text}`}
          direction="row"
          spacing={1}
          sx={{ alignItems: "flex-start", "&:hover .remove": { opacity: 1 } }}
        >
          <Typography variant="body2" sx={{ flexGrow: 1, py: 0.5 }}>
            {item.text}
            <SourceLinks ids={item.sourceIds} briefing={briefing} />
          </Typography>
          <IconButton
            className="remove"
            size="small"
            onClick={() => onRemove(index)}
            aria-label={`Remove: ${item.text}`}
            sx={{ opacity: { xs: 1, md: 0.4 }, "&:focus-visible": { opacity: 1 } }}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </Stack>
      ))}
    </Stack>
  );
}

/** The role briefing from web research: runs once automatically, refreshes when the role changes. */
export default function BriefingCard({ draft, update }: Props) {
  const requirements = draft.requirements!;
  const subjectKey = briefingSubjectKey(requirements);
  const { briefing } = draft;
  const stale = Boolean(briefing) && draft.briefingFor !== subjectKey;

  const research = useMutation({
    mutationFn: (refresh: boolean) => {
      const { title, company, seniority } = cleanRequirements(requirements);
      return api.post<{ briefing: RoleBriefing }>("/setup/research", { title, company, seniority, refresh });
    },
    onSuccess: ({ briefing: next }) => update({ briefing: next, briefingFor: subjectKey }),
  });

  // Research once automatically, the first time this role is reviewed.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStarted.current && !briefing && draft.briefingFor === null && requirements.title.trim()) {
      autoStarted.current = true;
      research.mutate(false);
    }
  }, [briefing, draft.briefingFor, requirements.title, research]);

  const notConfigured =
    research.error instanceof ApiError && research.error.code === "RESEARCH_UNAVAILABLE" && research.error.message.includes("isn't set up");
  const remove = (section: Section, index: number) =>
    briefing && update({ briefing: { ...briefing, [section]: briefing[section].filter((_, i) => i !== index) } });
  const isEmpty = briefing && SECTIONS.every(({ key }) => briefing[key].length === 0);

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
          <PublicRounded color="primary" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Role briefing
          </Typography>
          {(briefing || research.error) && !notConfigured && (
            <Button
              size="small"
              startIcon={research.isPending ? <CircularProgress size={14} /> : <RefreshRounded />}
              disabled={research.isPending || !requirements.title.trim()}
              onClick={() => research.mutate(true)}
            >
              {stale ? "Update for your edits" : "Refresh"}
            </Button>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {briefing?.scope === "role"
            ? "General briefing for this role. Add the company above for a company-specific one."
            : "What the web says about this company and role. About a third of the questions draw on it."}
        </Typography>

        {research.isPending && !briefing ? (
          <Stack spacing={1}>
            <Typography variant="body2">Searching the web for {requirements.company || "this role"}…</Typography>
            <Skeleton variant="text" />
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="60%" />
          </Stack>
        ) : notConfigured ? (
          <Alert severity="info" variant="outlined">
            Web research isn't set up on this server, so questions come from your resume and the job description only.
          </Alert>
        ) : research.error && !briefing ? (
          <Alert severity="warning">{research.error.message}</Alert>
        ) : briefing ? (
          <Stack spacing={2} sx={{ opacity: stale || research.isPending ? 0.6 : 1 }}>
            {research.error && <Alert severity="warning">{research.error.message}</Alert>}
            {isEmpty ? (
              <Typography variant="body2" color="text.secondary">
                We couldn't find anything useful about this role on the web.
              </Typography>
            ) : (
              SECTIONS.filter(({ key }) => briefing[key].length > 0).map(({ key, title }) => (
                <Box key={key}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    {title}
                  </Typography>
                  <Points items={briefing[key]} briefing={briefing} onRemove={(index) => remove(key, index)} />
                </Box>
              ))
            )}
            {briefing.sources.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Sources
                </Typography>
                <Stack component="ol" spacing={0.25} sx={{ pl: 3, m: 0 }}>
                  {briefing.sources.map((source) => (
                    <Typography component="li" variant="caption" key={source.id}>
                      <Link href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.title}
                      </Link>{" "}
                      <Box component="span" sx={{ color: "text.secondary" }}>
                        · {domain(source.url)}
                      </Box>
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}
            <Typography variant="caption" color="text.secondary">
              From public web sources; may be inaccurate or out of date. Remove anything that looks wrong.
            </Typography>
          </Stack>
        ) : null}
      </CardContent>
    </Card>
  );
}
