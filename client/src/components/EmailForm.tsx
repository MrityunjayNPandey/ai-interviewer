import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../App";

const startInterviewMutationFn = async (email: string) => {
  const payload = { emailId: email };
  const response = await fetch(`${API_BASE_URL}/startInterview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: "An error occurred" }));
    throw new Error(
      errorData.message || `HTTP error! status: ${response.status}`
    );
  }
  return response.json();
};

function EmailForm() {
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: startInterviewMutationFn,
    onSuccess: (data) => {
      console.log("🚀 ~ EmailForm ~ data:", data);
      if (data.createInterview) {
        navigate("/details", { state: { email } });
      } else {
        navigate("/interview", { state: { email } });
      }
    },
    onError: (error) => {
      console.error("Failed to start interview:", error);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFormError("Please enter your email.");
      return;
    }

    mutation.mutate(email);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "20vh",
        minWidth: "100vh",
        textAlign: "center",
        padding: "20px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "15px",
          width: "80%",
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      >
        {formError && (
          <p style={{ color: "orange", marginBottom: "10px" }}>{formError}</p>
        )}

        {mutation.isError && (
          <p style={{ color: "red", marginBottom: "10px" }}>
            Error:{" "}
            {mutation.error instanceof Error
              ? mutation.error.message
              : "An unknown error occurred"}
          </p>
        )}

        <div style={{ width: "100%" }}>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={mutation.isPending}
            placeholder="Enter your email"
            style={{
              width: "calc(100% - 20px)",
              padding: "10px",
              fontSize: "1.2em",
              borderRadius: "5px",
              border: "1px solid #ddd",
              boxSizing: "border-box",
              backgroundColor: "#f9f9f9",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          style={{
            padding: "10px 20px",
            fontSize: "1.2em",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            transition: "background-color 0.3s ease",
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.backgroundColor = "#0056b3")
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.backgroundColor = "#007bff")
          }
        >
          {mutation.isPending ? "Starting..." : "Next"}
        </button>
      </form>
    </div>
  );
}

export default EmailForm;
