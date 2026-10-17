import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "../../api/client";
import type { UsageReport } from "../../api/types";

// The admin token stays in this tab only (sessionStorage), and only this page sends it.
const TOKEN_KEY = "ai-interviewer.adminToken";

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Blocked storage: the token just isn't remembered.
  }
}

const number = (value: number) => value.toLocaleString();
const percent = (used: number, limit: number) => (limit > 0 ? Math.min(100, (used / limit) * 100) : 100);

/** Near or at a cap. The color always comes with an icon and a label; nothing is shown while there's room. */
function CapStatus({ used, limit }: { used: number; limit: number }) {
  const share = percent(used, limit);
  if (share >= 100) {
    return <Chip size="small" variant="outlined" color="error" icon={<ErrorOutlineRounded />} label="Used up" />;
  }
  if (share >= 80) {
    return <Chip size="small" variant="outlined" color="warning" icon={<WarningAmberRounded />} label="Running low" />;
  }
  return null;
}

/** Used against a cap: a single-hue track and fill. */
function Meter({ used, limit, label }: { used: number; limit: number; label: string }) {
  return (
    <LinearProgress
      variant="determinate"
      value={percent(used, limit)}
      aria-label={`${label}: ${number(used)} of ${number(limit)} used`}
      sx={{ height: 8, borderRadius: 4, "& .MuiLinearProgress-bar": { borderRadius: 4 } }}
    />
  );
}

function CapTile({ title, used, limit, unit }: { title: string; used: number; limit: number; unit: string }) {
  return (
    <Card sx={{ flex: 1, minWidth: 0 }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
          <CapStatus used={used} limit={limit} />
        </Stack>
        <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
          {number(Math.max(0, limit - used))}
          <Typography component="span" variant="body2" color="text.secondary">
            {" "}
            {unit} left
          </Typography>
        </Typography>
        <Box sx={{ my: 1 }}>
          <Meter used={used} limit={limit} label={title} />
        </Box>
        <Typography variant="body2" color="text.secondary">
          {number(used)} of {number(limit)} used
        </Typography>
      </CardContent>
    </Card>
  );
}

function CountTile({ title, value, note }: { title: string; value: number; note: string }) {
  return (
    <Card sx={{ flex: 1, minWidth: 0 }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
          {number(value)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {note}
        </Typography>
      </CardContent>
    </Card>
  );
}

function Section({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  return (
    <Stack spacing={1}>
      <Box>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {caption && (
          <Typography variant="body2" color="text.secondary">
            {caption}
          </Typography>
        )}
      </Box>
      <Card>
        <TableContainer>{children}</TableContainer>
      </Card>
    </Stack>
  );
}

const numeric = { align: "right" as const, sx: { whiteSpace: "nowrap" } };

function ModelsTable({ models }: { models: UsageReport["models"] }) {
  return (
    <Table size="small" aria-label="AI models">
      <TableHead>
        <TableRow>
          <TableCell>Model</TableCell>
          <TableCell {...numeric}>Used</TableCell>
          <TableCell {...numeric}>Remaining</TableCell>
          <TableCell sx={{ minWidth: 180 }}>Of its daily cap</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {models.map((model) => (
          <TableRow key={model.id}>
            <TableCell sx={{ whiteSpace: "nowrap" }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {model.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {model.provider}
              </Typography>
            </TableCell>
            <TableCell {...numeric}>{number(model.used)}</TableCell>
            <TableCell {...numeric}>{model.remaining === null ? "—" : number(model.remaining)}</TableCell>
            <TableCell>
              {model.limit === null ? (
                <Typography variant="body2" color="text.secondary">
                  No token cap here: {model.provider} limits requests
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Meter used={model.used} limit={model.limit} label={model.label} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                    {number(model.limit)}
                  </Typography>
                  <CapStatus used={model.used} limit={model.limit} />
                </Stack>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** "used / cap", plus a status when it's near or at the cap. */
function Against({ used, limit }: { used: number; limit: number }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
      <span>
        {number(used)}
        <Typography component="span" variant="body2" color="text.secondary">
          {" "}
          / {number(limit)}
        </Typography>
      </span>
      <CapStatus used={used} limit={limit} />
    </Stack>
  );
}

const Empty = ({ columns, children }: { columns: number; children: ReactNode }) => (
  <TableRow>
    <TableCell colSpan={columns}>
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    </TableCell>
  </TableRow>
);

function CandidatesTable({ report }: { report: UsageReport }) {
  const { candidates, limits } = report;
  return (
    <Table size="small" aria-label="Candidates">
      <TableHead>
        <TableRow>
          <TableCell>Candidate</TableCell>
          <TableCell {...numeric}>AI tokens</TableCell>
          <TableCell {...numeric}>Interviews</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {candidates.length === 0 && <Empty columns={3}>No one has used the app on this day.</Empty>}
        {candidates.map((candidate) => (
          <TableRow key={candidate.id}>
            <TableCell>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Box component="span" title={candidate.id} sx={{ fontFamily: "monospace" }}>
                  {candidate.id.slice(0, 8)}
                </Box>
                {candidate.saved && <Chip size="small" variant="outlined" label="Saved" />}
              </Stack>
            </TableCell>
            <TableCell {...numeric}>
              <Against used={candidate.tokens} limit={limits.tokensPerCandidate} />
            </TableCell>
            <TableCell {...numeric}>
              <Against used={candidate.interviews} limit={limits.interviewsPerCandidate} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NetworksTable({ report }: { report: UsageReport }) {
  const { networks, limits } = report;
  return (
    <Table size="small" aria-label="Networks">
      <TableHead>
        <TableRow>
          <TableCell>Network</TableCell>
          <TableCell {...numeric}>AI tokens</TableCell>
          <TableCell {...numeric}>Interviews</TableCell>
          <TableCell {...numeric}>Searches</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {networks.length === 0 && <Empty columns={4}>No traffic on this day.</Empty>}
        {networks.map((network) => (
          <TableRow key={network.network}>
            <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{network.network}</TableCell>
            <TableCell {...numeric}>
              <Against used={network.tokens} limit={limits.tokensPerIp} />
            </TableCell>
            <TableCell {...numeric}>
              <Against used={network.interviews} limit={limits.interviewsPerIp} />
            </TableCell>
            <TableCell {...numeric}>
              <Against used={network.searches} limit={limits.searchesPerIp} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TokenForm({ error, onSubmit }: { error: string | null; onSubmit: (token: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <Card sx={{ maxWidth: 480, mx: "auto" }}>
      <CardContent>
        <Stack component="form" spacing={2} onSubmit={submit}>
          <Typography variant="h6" component="h1">
            Usage
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter the admin token (the server's ADMIN_TOKEN). It's kept in this tab only.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Admin token"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            autoFocus
          />
          <Box>
            <Button type="submit" variant="contained" startIcon={<LockRounded />} disabled={!value.trim()}>
              Open
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Admin: today's usage across everyone, and what's left of each daily cap. Not linked from the app. */
export default function UsagePage() {
  const [token, setToken] = useState(readToken);
  const [day, setDay] = useState<string | null>(null); // null: today
  const [rejected, setRejected] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ["admin", "usage", token, day],
    queryFn: async () => {
      try {
        return await api.get<UsageReport>(`/admin/usage${day ? `?day=${day}` : ""}`, { Authorization: `Bearer ${token}` });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          // Wrong token, or the admin pages are off on the server.
          writeToken("");
          setToken("");
          setRejected("That token wasn't accepted, or ADMIN_TOKEN isn't set (32+ characters) on the server.");
        }
        throw error;
      }
    },
    enabled: Boolean(token),
    refetchInterval: 30_000,
    retry: false,
  });

  if (!token) {
    return (
      <TokenForm
        error={rejected}
        onSubmit={(next) => {
          writeToken(next);
          setRejected(null);
          setToken(next);
        }}
      />
    );
  }

  const data = report.data;
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            Usage
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {data ? `${data.day} (UTC). Daily caps reset at 00:00 UTC.` : "Loading…"}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          {data && (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={data.day === data.today ? "today" : "yesterday"}
              onChange={(_event, value: "today" | "yesterday" | null) => value && setDay(value === "today" ? null : data.yesterday)}
              aria-label="Day"
            >
              <ToggleButton value="today">Today</ToggleButton>
              <ToggleButton value="yesterday">Yesterday</ToggleButton>
            </ToggleButtonGroup>
          )}
          <Button size="small" startIcon={<RefreshRounded />} loading={report.isFetching} onClick={() => void report.refetch()}>
            Refresh
          </Button>
          <Button
            size="small"
            color="inherit"
            startIcon={<LockRounded />}
            onClick={() => {
              writeToken("");
              setToken("");
            }}
          >
            Lock
          </Button>
        </Stack>
      </Stack>

      {report.error && !(report.error instanceof ApiError && report.error.status === 404) && (
        <Alert severity="error">Couldn't load usage: {report.error.message}</Alert>
      )}

      {!data ? (
        <Skeleton variant="rounded" height={160} />
      ) : (
        <>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <CapTile title="AI tokens, everyone" used={data.tokens.used} limit={data.tokens.limit} unit="tokens" />
            <CapTile title="Web searches, everyone" used={data.searches.used} limit={data.searches.limit} unit="searches" />
            <CountTile
              title="Interviews started"
              value={data.interviewsStarted}
              note={`Up to ${data.limits.interviewsPerCandidate} per candidate and ${data.limits.interviewsPerIp} per network a day`}
            />
          </Stack>

          <Section title="Models" caption="Tokens counted by this app. A model is refused here once it reaches its own cap; the app-wide cap still applies.">
            <ModelsTable models={data.models} />
          </Section>

          <Section title="Candidates" caption="Heaviest 50, by AI tokens. Candidates are anonymous browser ids; hover for the full id.">
            <CandidatesTable report={data} />
          </Section>

          <Section title="Networks" caption="Heaviest 50. IPv6 is grouped by /64, as the limits count it.">
            <NetworksTable report={data} />
          </Section>
        </>
      )}
    </Stack>
  );
}
