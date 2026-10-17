import { Card, CardContent, Stack, Typography } from "@mui/material";
import type { InterviewView } from "../../api/types";

// Minimal report until the full report view lands.
export default function ReportView({ interview }: { interview: InterviewView }) {
  const report = interview.report;
  return (
    <Card sx={{ maxWidth: 860, mx: "auto" }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h4">{report ? `${report.overallScore}/10` : "Interview complete"}</Typography>
          {report && <Typography>{report.summary}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}
