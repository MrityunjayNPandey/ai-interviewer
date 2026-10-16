import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import InterviewPage from "./pages/interview/InterviewPage";
import NotFoundPage from "./pages/NotFoundPage";
import SetupPage from "./pages/setup/SetupPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="new" element={<SetupPage />} />
        <Route path="interviews/:id" element={<InterviewPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
