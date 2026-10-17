import { Box, CircularProgress } from "@mui/material";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";

// The setup wizard and the interview room load on demand, so the home page stays light.
const SetupPage = lazy(() => import("./pages/setup/SetupPage"));
const InterviewPage = lazy(() => import("./pages/interview/InterviewPage"));

function PageLoading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress />
    </Box>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="new"
          element={
            <Suspense fallback={<PageLoading />}>
              <SetupPage />
            </Suspense>
          }
        />
        <Route
          path="interviews/:id"
          element={
            <Suspense fallback={<PageLoading />}>
              <InterviewPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
