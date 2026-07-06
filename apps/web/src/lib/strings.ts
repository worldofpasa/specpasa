/**
 * All user-facing copy lives here — pages and islands must not carry naked
 * string literals. When localization lands, this module becomes a per-locale
 * lookup and nothing else changes. Compose, don't concatenate, at call sites.
 */

export const APP_NAME = "specpasa";

/** "Part — Part — specpasa" browser/page titles. */
export const pageTitle = (...parts: string[]): string => [...parts, APP_NAME].join(" — ");

export const t = {
  nav: {
    projects: "Projects",
    providers: "AI Providers",
    logout: "Log out",
  },
  auth: {
    setupHeading: `Welcome to ${APP_NAME}`,
    setupTagline: "First run: create the admin account and your workspace.",
    setupTitle: pageTitle("Set up"),
    name: "Your name",
    email: "Email",
    password: "Password (8+ characters)",
    passwordPlain: "Password",
    workspaceName: "Workspace name",
    workspacePlaceholder: "e.g. worldofpasa",
    createWorkspace: "Create workspace",
    loginHeading: "Log in",
    loginTitle: pageTitle("Log in"),
    loginSubmit: "Log in",
  },
  projects: {
    listLabel: "Projects",
    empty: "No projects yet — create the first one below.",
    newHeading: "New project",
    namePlaceholder: "Project name",
    descriptionPlaceholder: "Description (optional)",
    create: "Create project",
  },
  intents: {
    listLabel: "Intents",
    empty: "No intents yet. An intent captures one goal — e.g. “Self-serve onboarding”.",
    newHeading: "New intent",
    titlePlaceholder: "Intent title",
    descriptionPlaceholder: "Description (optional)",
    create: "Create intent",
  },
  specs: {
    listLabel: "Specs",
    empty: "No specs yet — start with a blank PRD below.",
    newHeading: "New spec (starts in the PRD phase)",
    titlePlaceholder: "Spec title",
    create: "Create spec",
    versionHistory: "Version history",
  },
  editor: {
    blankSpec: "Blank spec",
    version: (n: number) => `Version ${n}`,
    unsaved: "unsaved changes",
    edit: "Edit",
    preview: "Preview",
    save: "Save as new version",
    saving: "Saving…",
    placeholder:
      "Start with rough thoughts, bullet points, links — anything.\nThen ask AI to draft the PRD below.",
    aiHeading: "Brainstorm with AI",
    aiNoProviders: "No AI providers configured yet — ",
    aiNoProvidersLink: "add one in settings",
    aiPromptDraft: "Rough thoughts to turn into a draft PRD…",
    aiPromptRevise: "How should the AI revise the current document?",
    aiDraft: "Draft with AI",
    aiRevise: "Revise with AI",
    aiGenerating: "Generating…",
    aiAutoSaveNote: "Saves automatically as a new version marked AI-generated.",
  },
  versions: {
    heading: "Version history",
    crumb: "versions",
    titleFor: (spec: string) => pageTitle("Versions", spec),
    empty: "No versions yet.",
    aiBadge: "AI-generated",
    diffSummary: (base: string, added: number, removed: number, unchanged: number) =>
      `Block-level diff against ${base} — ${added} added, ${removed} removed, ${unchanged} unchanged.`,
    blankBase: "the blank spec",
    versionBase: (n: number) => `v${n}`,
  },
  providers: {
    heading: "AI Providers",
    tagline:
      "Workspace-scoped provider configs. API keys are encrypted at rest and never sent to the browser.",
    title: pageTitle("AI Providers"),
    detectedHeading: "Detected on this host",
    ollamaRunning: (detail: string) => `✓ Ollama is running — ${detail}`,
    ollamaAbsent:
      "Ollama not detected on localhost:11434. Local CLI detection (claude, codex) arrives in M5.",
    empty: "No providers configured yet.",
    keyStored: "key stored (encrypted)",
    remove: "Remove",
    addAnthropic: "Add Anthropic",
    addOllama: "Add Ollama (local)",
    displayNameAnthropic: "Display name (e.g. Claude)",
    displayNameOllama: "Display name (e.g. Local Llama)",
    apiKeyPlaceholder: "API key (sk-ant-…)",
    modelPlaceholder: "Model (e.g. llama3.2)",
    baseUrlPlaceholder: "Base URL (default http://localhost:11434)",
    add: "Add",
  },
  lifecycle: {
    heading: "Lifecycle",
    requestReview: "Request review",
    backToDraft: "Back to draft",
    freeze: "Freeze",
    frozenNote: (when: string) => `Frozen ${when} — this spec is immutable. Fork it to iterate.`,
    freezeNeedsVersion: "Save at least one version before freezing.",
    startNextPhase: (phase: string) => `Start ${phase.toUpperCase()} phase`,
    derivedFrom: (phase: string) => `Derived from the frozen ${phase.toUpperCase()} spec`,
    seedHeading: (title: string, phase: string) => `# ${title} — ${phase.toUpperCase()}`,
    seedNote: (phase: string, n: number) =>
      `> Derived from the frozen ${phase.toUpperCase()} (v${n}). The source document is attached as a reference and fed to AI drafts.`,
    fork: "Fork",
    forkTitle: (title: string) => `${title} (fork)`,
    statusLabel: "Status",
  },
  references: {
    heading: "References",
    tagline: "Attached links, code, and specs are fed to AI drafts as context.",
    empty: "No references attached.",
    add: "Add reference",
    kindLabel: "Kind",
    kindUrl: "URL",
    kindGithub: "GitHub file",
    kindSpec: "Spec",
    titlePlaceholder: "Title",
    urlPlaceholder: "https://…",
    githubPlaceholder: "https://github.com/owner/repo/blob/main/path/to/file.ts",
    specIdPlaceholder: "Spec ID (from the spec URL)",
    remove: "Remove",
  },
} as const;
