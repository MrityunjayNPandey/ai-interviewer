import { Route, Routes } from "react-router-dom";
import "./App.css";
import DetailsForm from "./components/DetailsForm";
import EmailForm from "./components/EmailForm";
import Interview from "./components/Interview";

export const API_BASE_URL = import.meta.env.VITE_SERVER_URL;

function App() {
  return (
    <>
      <h1>AI Interviewer</h1>
      <div className="card">
        <Routes>
          <Route path="/" element={<EmailForm />} />
          <Route path="/details" element={<DetailsForm />} />
          <Route path="/interview" element={<Interview />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
