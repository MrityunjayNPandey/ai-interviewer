import ArrowForward from "@mui/icons-material/ArrowForward";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import { Box, Button, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import InterviewHistory from "./InterviewHistory";

const steps: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <DescriptionOutlined color="primary" />,
    title: "Bring your resume and the job",
    body: "Upload your resume and paste the job description. We pull out your profile and the role's requirements, and you can fix anything we got wrong.",
  },
  {
    icon: <ChatOutlined color="primary" />,
    title: "Answer tailored questions",
    body: "Pick the type, level and length. The interviewer asks about your experience and the role, and follows up on what you say.",
  },
  {
    icon: <InsightsOutlined color="primary" />,
    title: "Get a coaching report",
    body: "See a score for every answer, what a strong answer would have included, and the few things to work on next.",
  },
];

export default function HomePage() {
  return (
    <Stack spacing={{ xs: 5, md: 8 }}>
      <Box sx={{ textAlign: "center", maxWidth: 720, mx: "auto", pt: { md: 4 } }}>
        <Typography variant="h2" component="h1" sx={{ fontSize: { xs: "2.25rem", md: "3.25rem" }, mb: 2 }}>
          Practise the interview before it counts
        </Typography>
        <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 400, mb: 4 }}>
          A mock interview tailored to your resume and the job you want, with honest feedback on every answer.
        </Typography>
        <Button component={Link} to="/new" variant="contained" size="large" endIcon={<ArrowForward />}>
          Start a practice interview
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Free, no sign-up. Your interviews stay tied to this browser.
        </Typography>
      </Box>

      <InterviewHistory />

      <Grid container spacing={2}>
        {steps.map((step) => (
          <Grid key={step.title} size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Stack spacing={1.5}>
                  {step.icon}
                  <Typography variant="h6">{step.title}</Typography>
                  <Typography color="text.secondary">{step.body}</Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
