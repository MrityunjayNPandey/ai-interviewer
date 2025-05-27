import { Route, Routes } from "react-router-dom";
import "./App.css";
import DetailsForm from "./components/DetailsForm";
import EmailForm from "./components/EmailForm";
import Interview from "./components/Interview";

export const API_BASE_URL = import.meta.env.VITE_SERVER_URL;

function App() {
  return (
    <>
      <h1 style={{ color: "#007bff" }}>AI Interviewer</h1>
      <Routes>
        <Route path="/" element={<EmailForm />} />
        <Route path="/details" element={<DetailsForm />} />
        <Route path="/interview" element={<Interview />} />
      </Routes>
    </>
  );
}

export default App;
