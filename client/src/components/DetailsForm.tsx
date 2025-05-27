import { useState } from 'react';
import type { FormEvent } from 'react';

interface DetailsFormProps {
  onSubmit: (jobDescription: string, resume: string) => void;
}

function DetailsForm({ onSubmit }: DetailsFormProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [resume, setResume] = useState(''); // For simplicity, using textarea. Could be <input type="file">

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (jobDescription.trim() && resume.trim()) {
      onSubmit(jobDescription, resume);
    } else {
      alert('Please fill in all fields.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Job and Resume Details</h2>
      <div>
        <label htmlFor="jobDescription">Job Description:</label>
        <textarea
          id="jobDescription"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={5}
          required
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
        />
      </div>
      <button type="submit">Start Interview</button>
    </form>
  );
}

export default DetailsForm;