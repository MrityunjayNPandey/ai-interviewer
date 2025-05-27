# AI Interviewer Platform

## Overview

A system that conducts AI-powered interviews by analyzing resumes and job descriptions, then generating relevant questions and feedback.

## Key Features

- Resume and job description analysis
- Context-aware question generation (adaptability based on previous answers)
- Interview session management
- Automated feedback generation
- Transcript storage in database

## Technical Architecture

- **Client**: React/Vite frontend
- **Server**: Node.js backend with MongoDB
- **AI Integration**: GPT-based question generation

## Getting Started

1. Clone the repository
2. Install dependencies for both client and server
3. Configure MongoDB connection
4. Set up API keys for AI services
5. Run development servers

```
cd client && npm install && npm run dev
cd ../server && npm install && npm start
```
