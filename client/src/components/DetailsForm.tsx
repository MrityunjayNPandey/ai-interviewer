import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

const API_BASE_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:3000/api";
interface SubmitDetailsPayload {
  emailId: string;
  jd: string;
  resume: string;
}

const submitJdAndResumeFn = async (payload: SubmitDetailsPayload) => {
  const response = await fetch(`${API_BASE_URL}/submitJdAndResume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: "An error occurred while submitting details" }));
    throw new Error(
      errorData.message || `HTTP error! status: ${response.status}`
    );
  }
  return response.json();
};

function DetailsForm() {
  const [jobDescription, setJobDescription] = useState("");
  const [resume, setResume] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const { email } = location?.state ?? {};
  if (!email) {
    console.error("Email not found in location state.");
    return <Navigate to="/" />;
  }

  const mutation = useMutation({
    mutationFn: submitJdAndResumeFn,
    onSuccess: (data) => {
      console.log("Details submitted successfully:", data);
      navigate("/interview", { state: { email } });
    },
    onError: (error) => {
      console.error("Failed to submit details:", error);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!jobDescription.trim() || !resume.trim()) {
      setFormError("Please fill in all fields.");
      return;
    }

    mutation.mutate({ emailId: email, jd: jobDescription, resume });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Job and Resume Details</h2>
      {formError && <p style={{ color: "orange" }}>{formError}</p>}
      {mutation.isError && (
        <p style={{ color: "red" }}>
          Error:{" "}
          {mutation.error instanceof Error
            ? mutation.error.message
            : "An unknown error occurred"}
        </p>
      )}
      <div>
        <label htmlFor="jobDescription">Job Description:</label>
        <textarea
          id="jobDescription"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={5}
          required
          disabled={mutation.isPending}
        />
      </div>
      <div>
        <label htmlFor="resume">Resume (paste text):</label>
        <textarea
          id="resume"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          rows={10}
          required
          disabled={mutation.isPending}
        />
      </div>
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Submitting..." : "Start Interview"}
      </button>
    </form>
  );
}

export default DetailsForm;
