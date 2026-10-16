# AI Interviewer

A practice tool: a candidate rehearses a job interview with an AI interviewer, tailored to their resume and a target job description, and gets coaching on how they did.

## Language

### People

**Candidate**:
The person practising an interview. The only human party in the system; there is no employer or recruiter.
_Avoid_: User, applicant, interviewee

**Interviewer**:
The AI persona that asks the questions. Never a human.
_Avoid_: GPT, bot, assistant

### Setting up

**Resume**:
The candidate's CV, supplied as a PDF or pasted text, from which the interview is tailored.
_Avoid_: CV (in code), profile

**Job Description**:
The text of the role the candidate is practising for.
_Avoid_: JD (in prose), job posting

**Candidate Profile**:
The structured summary extracted from a resume (role, experience, skills, projects), reviewed and edited by the candidate before the interview starts.
_Avoid_: Parsed resume, resume data

**Role Requirements**:
The structured summary extracted from a job description (must-have skills, nice-to-haves, responsibilities), reviewed and edited by the candidate before the interview starts.
_Avoid_: Parsed JD, JD data

**Match**:
The overlap and gaps between a candidate profile and role requirements, shown before the interview starts.
_Avoid_: Fit score, compatibility

**Interview Type**:
The kind of questions asked: Behavioral, Technical, or Mixed.

**Difficulty**:
The seniority the questions are pitched at: Junior, Mid, or Senior.

**Length**:
The number of questions the candidate chose for an interview.

**Model**:
The AI model the candidate chose to play the interviewer, fixed for the whole interview unless the candidate switches after a failure.
_Avoid_: GPT, engine, provider (a provider hosts models; it is not one)

**Mode**:
Whether feedback is shown after each answer (**Coach**) or held back until the report (**Mock**).

### Interviewing

**Interview**:
One practice session: a setup, a sequence of turns, and (once finished) a report. It is either in progress or completed; one ended early is still completed.
_Avoid_: Session, context, conversation

**Turn**:
One question, the candidate's answer to it, and the feedback on that answer.
_Avoid_: Message, exchange

**Question**:
What the interviewer asks in a turn; may follow up on earlier answers.

**Answer**:
The candidate's response to a question.

**Feedback**:
The interviewer's short assessment of a single answer.
_Avoid_: Verdict, review

**Report**:
The structured assessment of a whole interview, produced when it ends: overall score, per-question scores, strengths, and gaps with ways to improve.
_Avoid_: Feedback, verdict, result

**Transcript**:
The ordered record of an interview's turns as the candidate experienced them.
_Avoid_: Context, history, log
