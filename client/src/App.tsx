import { useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import "./App.css";
import DetailsForm from "./components/DetailsForm";
import EmailForm from "./components/EmailForm";
import Interview from "./components/Interview";

function App() {
  // We'll store email, jobDescription, and resume here to pass to components
  // Or, you could use context or a state management library for more complex apps
  const [email, setEmail] = useState<string>("");
  const [jobDescription, setJobDescription] = useState<string>("");
  const [resumeText, setResumeText] = useState<string>(""); // Renamed to avoid conflict with resume keyword

  const navigate = useNavigate();

  const handleEmailSubmit = (submittedEmail: string) => {
    setEmail(submittedEmail);
    navigate("/details"); // Navigate to details form
  };

  const handleDetailsSubmit = (
    submittedJobDescription: string,
    submittedResume: string
  ) => {
    setJobDescription(submittedJobDescription);
    setResumeText(submittedResume);
    navigate("/interview"); // Navigate to interview page
  };

  return (
    <>
      <h1>AI Interviewer</h1>
      <div className="card">
        <Routes>
          <Route path="/" element={<EmailForm />} />
          <Route
            path="/details"
            element={<DetailsForm onSubmit={handleDetailsSubmit} />}
          />
          <Route
            path="/interview"
            element={
              <Interview
                email={email}
                jobDescription={jobDescription}
                resume={resumeText}
              />
            }
          />
        </Routes>
      </div>
    </>
  );
}

export default App;
