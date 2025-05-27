#AI Interviewer

## Server takes in the resume, with job description (text format), feeds it to the AI context and asks the questions according to the resume, JD and responses of the candidate.

## The transcripts should be stored in the database.

## After the interview ends, a feedback should be generated.

# Functionality:

1. User is identified by the email address. 
2. If the email is present in the cache-map, it fetches that, otherwise it fetches the context from the database. 
3. If the latest interview is incomplete, it resumes the interview. Otherwise, it starts a new interview.
4. Creating a web socket connection, would be optimal, however that would be complicated to implement.


# Schema:

```
Interview:

- _id
- emailId
- status
- feedback

InterviewContexts:

- _id
- interviewId
- context
- sequenceId
- role

```

APIs:

1. POST /startInterview: -- emailId -- returns true if no prev interview exists or prev interview was completed, otherwise false
2. POST /submitJdAndResume: -- emailId, jd, resume -- skipped if last interview was incomplete
3. POST /getGptQuestion: -- emailId -- if already present in cache/database, it returns the question, otherwise, asks gpt to generate the question
4. POST /submitGptAnswer: -- emailId, answer

Current Assumptions: 

1. No external person is trying to ruin the interview, hence no authentication is required.
2. The interview is not timed, hence no timeout is required.
