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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        padding: "20px",
        margin: "0 auto",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "300%",
          backgroundColor: "#f9f9f9",
          padding: "30px",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        {formError && (
          <div
            style={{
              color: "#e74c3c",
              backgroundColor: "#fadbd8",
              padding: "10px",
              borderRadius: "4px",
              marginBottom: "20px",
            }}
          >
            {formError}
          </div>
        )}

        {mutation.isError && (
          <div
            style={{
              color: "#e74c3c",
              backgroundColor: "#fadbd8",
              padding: "10px",
              borderRadius: "4px",
              marginBottom: "20px",
            }}
          >
            Error:{" "}
            {mutation.error instanceof Error
              ? mutation.error.message
              : "An unknown error occurred"}
          </div>
        )}

        <div
          style={{
            marginBottom: "25px",
            padding: "12px",
          }}
        >
          <label
            htmlFor="jobDescription"
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              color: "#34495e",
            }}
          >
            Job Description:
          </label>
          <textarea
            id="jobDescription"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
            required
            disabled={mutation.isPending}
            style={{
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "1em",
              resize: "vertical",
              minHeight: "150px",
            }}
            placeholder="Paste the job description here..."
          />
        </div>

        <div
          style={{
            marginBottom: "30px",
            padding: "12px",
          }}
        >
          <label
            htmlFor="resume"
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              color: "#34495e",
            }}
          >
            Resume (paste text):
          </label>
          <textarea
            id="resume"
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            rows={12}
            required
            disabled={mutation.isPending}
            style={{
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "1em",
              resize: "vertical",
              minHeight: "150px",
            }}
            placeholder="Paste your resume text here..."
          />
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: "#3498db",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "1em",
            fontWeight: "600",
            cursor: "pointer",
            transition: "background-color 0.3s",
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.backgroundColor = "#2980b9")
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.backgroundColor = "#3498db")
          }
        >
          {mutation.isPending ? "Submitting..." : "Start Interview"}
        </button>
      </form>
    </div>
  );
}

export default DetailsForm;
