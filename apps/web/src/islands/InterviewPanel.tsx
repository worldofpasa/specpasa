import { useEffect, useRef, useState } from "react";
import { streamEvents } from "../lib/stream";
import { t } from "../lib/strings";

/**
 * Interview/conversion panel: drives a claude CLI session over the streaming
 * interview (or convert) route, renders intercepted AskUserQuestion calls as
 * answerable cards, and follows the session to its end. Mirrors the shapes in
 * @specpasa/providers/node agent-session.ts — kept local because islands
 * can't import the Node-only entry.
 */

interface QuestionOption {
  label: string;
  description?: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface QuestionSet {
  id: string;
  questions: Question[];
}

type SessionEvent =
  | { type: "session"; sessionId: string }
  | { type: "ping" }
  | { type: "token"; text: string }
  | { type: "question"; questionSet: QuestionSet }
  | { type: "doc-update"; markdown: string }
  | { type: "done"; specId?: string }
  | { type: "error"; message: string };

interface SkillOption {
  name: string;
  label: string;
  detail: string;
}

interface Props {
  specId: string;
  mode: "interview" | "convert";
  /** Interview mode: the selectable skills. Ignored for convert. */
  skills?: SkillOption[];
  /** Convert mode: display label of the phase being generated. */
  nextPhaseLabel?: string;
}

type Phase = "idle" | "running" | "done" | "error";

const TRANSCRIPT_LIMIT = 8000;

interface SessionHandlers {
  onSession: (sessionId: string) => void;
  onToken: (text: string) => void;
  onQuestion: (questionSet: QuestionSet) => void;
  onDocUpdate: () => void;
  /** Return value: the stream is finished, stop consuming. */
  onDone: (specId?: string) => void;
  onError: (message: string) => void;
}

/** Returns true when the stream ended with a done/error event. */
async function consumeSession(response: Response, handlers: SessionHandlers): Promise<boolean> {
  for await (const event of streamEvents<SessionEvent>(response)) {
    if (event.type === "session") handlers.onSession(event.sessionId);
    else if (event.type === "token") handlers.onToken(event.text);
    else if (event.type === "question") handlers.onQuestion(event.questionSet);
    else if (event.type === "doc-update") handlers.onDocUpdate();
    else if (event.type === "done") {
      handlers.onDone(event.specId);
      return true;
    } else if (event.type === "error") {
      handlers.onError(event.message);
      return true;
    }
  }
  return false;
}

export default function InterviewPanel({ specId, mode, skills = [], nextPhaseLabel }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [skill, setSkill] = useState(skills[0]?.name ?? "");
  const [kickoff, setKickoff] = useState("");
  const [transcript, setTranscript] = useState("");
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [docUpdatedAt, setDocUpdatedAt] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [transcript]);

  const start = async () => {
    setPhase("running");
    setTranscript("");
    setQuestionSet(null);
    setMessage("");
    try {
      const endpoint = mode === "interview" ? "/api/ai/interview" : "/api/ai/convert";
      const body =
        mode === "interview" ? { specId, skill, prompt: kickoff.trim() || undefined } : { specId };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.body) {
        setPhase("error");
        setMessage(t.interview.failed(await response.text()));
        return;
      }
      const finished = await consumeSession(response, {
        onSession: (sessionId) => (sessionIdRef.current = sessionId),
        onToken: (text) => setTranscript((prev) => (prev + text).slice(-TRANSCRIPT_LIMIT)),
        onQuestion: setQuestionSet,
        onDocUpdate: () => setDocUpdatedAt(Date.now()),
        onDone: (newSpecId) => {
          setPhase("done");
          if (mode === "convert" && newSpecId) {
            setMessage(t.interview.doneConvert);
            window.location.assign(`/specs/${newSpecId}`);
          } else {
            setMessage(t.interview.doneInterview);
            window.location.reload();
          }
        },
        onError: (detail) => {
          setPhase("error");
          setMessage(t.interview.failed(detail));
        },
      });
      if (!finished) {
        // The stream ended without a done/error event: session cancelled.
        setPhase("idle");
        setMessage(t.interview.sessionEnded);
      }
    } catch (error) {
      setPhase("error");
      setMessage(t.interview.failed(error instanceof Error ? error.message : String(error)));
    } finally {
      sessionIdRef.current = null;
    }
  };

  const cancel = async () => {
    const sessionId = sessionIdRef.current;
    if (sessionId) await fetch(`/api/ai/interview/${sessionId}/cancel`, { method: "POST" });
  };

  const answer = async (answers: { question: string; selections: string[] }[]) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !questionSet) return;
    setQuestionSet(null);
    await fetch(`/api/ai/interview/${sessionId}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionSetId: questionSet.id, answers }),
    });
  };

  return (
    <section className="rounded border border-line bg-sheet">
      <h2 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs font-semibold text-neutral-500">
        {mode === "interview" ? t.interview.heading : t.interview.convertHeading}
        {phase === "running" && (
          <button onClick={() => void cancel()} className="text-review hover:underline">
            {t.interview.cancel}
          </button>
        )}
      </h2>

      <div className="flex flex-col gap-3 p-4">
        {phase === "idle" && mode === "interview" && (
          <InterviewSetup
            skills={skills}
            skill={skill}
            onSkillChange={setSkill}
            kickoff={kickoff}
            onKickoffChange={setKickoff}
            onStart={() => void start()}
          />
        )}

        {phase === "idle" && mode === "convert" && (
          <ConvertSetup nextPhaseLabel={nextPhaseLabel ?? ""} onStart={() => void start()} />
        )}

        {phase === "running" && (
          <RunningView
            questionSet={questionSet}
            onAnswer={(answers) => void answer(answers)}
            docUpdatedAt={docUpdatedAt}
            transcript={transcript}
            transcriptRef={transcriptRef}
          />
        )}

        {message && phase !== "running" && (
          <p className={`text-sm ${phase === "error" ? "text-review" : "text-neutral-500"}`}>
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

function RunningView({
  questionSet,
  onAnswer,
  docUpdatedAt,
  transcript,
  transcriptRef,
}: {
  questionSet: QuestionSet | null;
  onAnswer: (answers: { question: string; selections: string[] }[]) => void;
  docUpdatedAt: number | null;
  transcript: string;
  transcriptRef: React.RefObject<HTMLPreElement | null>;
}) {
  return (
    <>
      {questionSet ? (
        <QuestionCard key={questionSet.id} questionSet={questionSet} onSubmit={onAnswer} />
      ) : (
        <p className="text-sm text-neutral-500">{t.interview.working}</p>
      )}
      {docUpdatedAt && (
        <p className="text-xs text-accent">
          ✓ {t.interview.docUpdated} · {new Date(docUpdatedAt).toLocaleTimeString()}
        </p>
      )}
      {transcript && (
        <details open>
          <summary className="cursor-pointer text-xs font-medium text-neutral-500">
            {t.interview.transcript}
          </summary>
          <pre
            ref={transcriptRef}
            className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-line p-3 font-mono text-xs text-neutral-500"
          >
            {transcript}
          </pre>
        </details>
      )}
    </>
  );
}

function InterviewSetup({
  skills,
  skill,
  onSkillChange,
  kickoff,
  onKickoffChange,
  onStart,
}: {
  skills: SkillOption[];
  skill: string;
  onSkillChange: (name: string) => void;
  kickoff: string;
  onKickoffChange: (value: string) => void;
  onStart: () => void;
}) {
  return (
    <>
      <p className="text-xs text-neutral-500">{t.interview.tagline}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold text-neutral-500">
          {t.interview.skillLabel}
        </legend>
        {skills.map((option) => (
          <label key={option.name} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="interview-skill"
              checked={skill === option.name}
              onChange={() => onSkillChange(option.name)}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="block text-xs text-neutral-500">{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <textarea
        value={kickoff}
        onChange={(event) => onKickoffChange(event.target.value)}
        placeholder={t.interview.promptPlaceholder}
        rows={3}
        className="rounded border border-line bg-transparent px-3 py-2 text-sm placeholder:text-neutral-400"
      />
      <button
        onClick={onStart}
        className="self-start rounded bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90"
      >
        {t.interview.start}
      </button>
    </>
  );
}

function ConvertSetup({
  nextPhaseLabel,
  onStart,
}: {
  nextPhaseLabel: string;
  onStart: () => void;
}) {
  return (
    <>
      <p className="text-xs text-neutral-500">{t.interview.convertTagline(nextPhaseLabel)}</p>
      <button
        onClick={onStart}
        className="self-start rounded bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90"
      >
        {t.interview.convert(nextPhaseLabel)}
      </button>
    </>
  );
}

function QuestionCard({
  questionSet,
  onSubmit,
}: {
  questionSet: QuestionSet;
  onSubmit: (answers: { question: string; selections: string[] }[]) => void;
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const toggle = (question: Question, label: string) => {
    setSelections((prev) => {
      const current = prev[question.question] ?? [];
      if (question.multiSelect) {
        return {
          ...prev,
          [question.question]: current.includes(label)
            ? current.filter((l) => l !== label)
            : [...current, label],
        };
      }
      return { ...prev, [question.question]: [label] };
    });
  };

  const answered = (question: Question) =>
    (selections[question.question]?.length ?? 0) > 0 || Boolean(other[question.question]?.trim());

  const submit = () => {
    onSubmit(
      questionSet.questions.map((question) => ({
        question: question.question,
        selections: other[question.question]?.trim()
          ? [other[question.question]!.trim()]
          : (selections[question.question] ?? []),
      })),
    );
  };

  return (
    <div className="flex flex-col gap-4 rounded border border-accent/40 bg-accent-soft/30 p-3">
      {questionSet.questions.map((question) => (
        <div key={question.question} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">
              {question.header}
            </span>
            <span className="text-sm font-medium">{question.question}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {question.options.map((option) => {
              const active = (selections[question.question] ?? []).includes(option.label);
              return (
                <button
                  key={option.label}
                  onClick={() => toggle(question, option.label)}
                  className={`rounded border px-3 py-1.5 text-left text-sm ${
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className="font-medium">{option.label}</span>
                  {option.description && (
                    <span className="block text-xs text-neutral-500">{option.description}</span>
                  )}
                </button>
              );
            })}
            <input
              value={other[question.question] ?? ""}
              onChange={(event) =>
                setOther((prev) => ({ ...prev, [question.question]: event.target.value }))
              }
              placeholder={t.interview.otherPlaceholder}
              className="rounded border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-neutral-400"
            />
          </div>
        </div>
      ))}
      <button
        onClick={submit}
        disabled={!questionSet.questions.every(answered)}
        className="self-start rounded bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-40"
      >
        {t.interview.answer}
      </button>
    </div>
  );
}
