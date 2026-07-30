/**
 * All user-facing copy lives here — pages and islands must not carry naked
 * string literals. When localization lands, this module becomes a per-locale
 * lookup and nothing else changes. Compose, don't concatenate, at call sites.
 */

export const APP_NAME = "specpasa";

/** "Part — Part — specpasa" browser/page titles. */
export const pageTitle = (...parts: string[]): string => [...parts, APP_NAME].join(" — ");

/**
 * Display label per spec *phase*. The draft phase renders as "IDEA" so it can
 * never be confused with the "Draft" *status* stamp shown next to it.
 */
const phaseLabel = (phase: string): string =>
  (({ draft: "IDEA", prd: "PRD", erd: "ERD", tasks: "TASKS" }) as Record<string, string>)[phase] ??
  phase.toUpperCase();

export const t = {
  phases: {
    label: phaseLabel,
    long: (phase: string) =>
      (
        ({
          draft: "Idea draft",
          prd: "Product requirements",
          erd: "Engineering requirements",
          tasks: "Implementation tasks",
        }) as Record<string, string>
      )[phase] ?? phase,
  },
  ui: {
    close: "Close",
    closeGlyph: "✕",
    infoGlyph: "ⓘ",
    cancel: "Cancel",
  },
  nav: {
    projects: "Projects",
    providers: "AI Providers",
    templates: "Templates",
    members: "Members",
    logout: "Log out",
    theme: {
      system: "Theme: match system",
      light: "Theme: light",
      dark: "Theme: dark",
      glyphSystem: "◐",
      glyphLight: "☀",
      glyphDark: "☾",
    },
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
    localWorkspaceName: "Local Workspace",
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
    newHeading: "New spec",
    titlePlaceholder: "Spec title",
    create: "Create spec",
    versionHistory: "Version history",
    startPhaseLabel: "Starting point",
    startDraft: "Idea first",
    startDraftDetail: "Sharpen a rough idea into a PRD with an AI interview",
    startPrd: "Straight to PRD",
    startPrdDetail: "Write the requirements document directly",
  },
  editor: {
    blankSpec: "Blank spec",
    version: (n: number) => `Version ${n}`,
    unsaved: "unsaved changes",
    draftSaved: "Draft saved",
    draftRestored: "Working draft — not saved as a version yet.",
    discardDraft: "Discard draft",
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
    aiIncludesComments: (n: number) =>
      n === 1
        ? "1 open review comment will be included"
        : `${n} open review comments will be included`,
    aiContextLabel: "Context",
    aiRefIncluded: "Included — click to exclude",
    aiRefExcluded: "Excluded — click to include",
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
    backToWorkspace: "Back to workspace",
    addedBadge: "Added",
    removedBadge: "Removed",
  },
  providers: {
    heading: "AI Providers",
    tagline:
      "Workspace-scoped provider configs. API keys are encrypted at rest and never sent to the browser.",
    title: pageTitle("AI Providers"),
    detectedHeading: "Detected on this host",
    detectedItem: (name: string, detail: string) => `✓ ${name} — ${detail}`,
    autoSyncNote:
      "Supported CLIs found on this host are added as providers automatically — disable one below to opt out without losing it.",
    disabledBadge: "disabled",
    enable: "Enable",
    disable: "Disable",
    deleteConfirmTitle: "Remove provider",
    deleteConfirmBody: (name: string) =>
      `Remove ${name}? It disappears from every AI picker — existing versions keep their history.`,
    deleteConfirmCliNote:
      "This CLI is still installed on this host, so it will be re-added automatically on the next visit. Disable it instead if you want it to stay off.",
    nothingDetected:
      "No local AI backends detected — looked for Ollama on localhost:11434 and the claude, codex, cursor-agent, and grok CLIs on PATH.",
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
    addLocalCli: "Add local CLI",
    autoAddedName: (command: string) => `${command} CLI`,
    localCliNote: "Runs the CLI on this host — nothing leaves the machine, no API key needed.",
    displayNameLocalCli: "Display name (e.g. Claude CLI)",
    cliCommandLabel: "Command",
    add: "Add",
  },
  lifecycle: {
    heading: "Lifecycle",
    requestReview: "Request review",
    backToDraft: "Back to draft",
    freeze: "Freeze",
    frozenNote: (when: string) => `Frozen ${when} — this spec is immutable. Fork it to iterate.`,
    freezeNeedsVersion: "Save at least one version before freezing.",
    startNextPhase: (phase: string) => `Start blank ${phaseLabel(phase)}`,
    derivedFrom: (phase: string) => `Derived from the frozen ${phaseLabel(phase)} spec`,
    seedHeading: (title: string, phase: string) => `# ${title} — ${phaseLabel(phase)}`,
    seedNote: (phase: string, n: number) =>
      `> Derived from the frozen ${phaseLabel(phase)} (v${n}). The source document is attached as a reference and fed to AI drafts. Replace the starter sections below with your own content.`,
    fork: "Fork",
    forkTitle: (title: string) => `${title} (fork)`,
    statusLabel: "Status",
    statusName: (status: string) =>
      (({ draft: "Draft", in_review: "In review", frozen: "Frozen" }) as Record<string, string>)[
        status
      ] ?? status,
    openThreadsWarning: (n: number) =>
      n === 1 ? "1 comment thread is still open." : `${n} comment threads are still open.`,
    /** Client-side template for the live count (SpecLifecycle inline script). */
    openThreadsWarningTemplate: "{n} comment threads are still open.",
    freezeConfirmLabel: "Freeze anyway",
  },
  templates: {
    heading: "Templates",
    title: pageTitle("Templates"),
    tagline:
      "Document templates per phase. The default seeds new blank documents, and AI generation follows it as structure guidance.",
    kindLabel: (kind: string) => (kind === "ticket" ? "TICKET" : phaseLabel(kind)),
    kindDetail: (kind: string) =>
      (
        ({
          prd: "Seeds a blank PRD",
          erd: "Seeds a blank ERD and guides AI conversion",
          tasks: "Seeds the tickets document and guides AI conversion",
          ticket: "The body structure of each individual ticket",
        }) as Record<string, string>
      )[kind] ?? kind,
    builtinName: (kind: string) => `Standard ${kind === "ticket" ? "Ticket" : phaseLabel(kind)}`,
    builtinBadge: "Built-in",
    defaultBadge: "Default",
    makeDefault: "Make default",
    newTemplate: "+ New template",
    edit: "Edit",
    remove: "Remove",
    save: "Save template",
    namePlaceholder: "Template name",
    contentLabel: "Template content (markdown)",
    importLabel: "…or import a .md file (replaces the content above)",
    newModalTitle: (kind: string) =>
      `New ${kind === "ticket" ? "Ticket" : phaseLabel(kind)} template`,
    editModalTitle: (name: string) => `Edit ${name}`,
    newContentNote:
      "Prefilled with the built-in standard — edit it into your own, or import a file below.",
    /** Built-in standard sections per template kind — heading + guidance line. */
    builtinSections: (kind: string): [string, string][] =>
      (
        ({
          prd: [
            ["Problem", "What are we solving, for whom, and why now?"],
            ["Goals", "The outcomes this must achieve — measurable where possible."],
            ["Non-goals", "What is deliberately out of scope."],
            ["Requirements", "The functional requirements, one per block, with stable IDs."],
            ["Open questions", "Unresolved decisions to settle before freezing this PRD."],
          ],
          erd: [
            [
              "Overview",
              "How the system meets the frozen requirements — the architecture at a glance.",
            ],
            ["Data model", "Entities, fields, and relationships — one subsection per entity."],
            ["Interfaces", "APIs, events, and integration points between components."],
            [
              "Non-functional requirements",
              "Performance, security, reliability, and operational constraints.",
            ],
            ["Open questions", "Unresolved decisions to settle before freezing this ERD."],
          ],
          tasks: [
            ["Milestones", "The delivery order — what ships first and what it unblocks."],
            [
              "Task breakdown",
              "Epics as ## headings, each with a checklist of concrete, estimable tickets.",
            ],
            ["Open questions", "Anything still blocking a ticket from being actionable."],
          ],
          ticket: [
            ["Summary", "One sentence on what this ticket delivers."],
            ["Context", "Why this is needed — link the ERD section it implements."],
            ["Acceptance criteria", "Checkable statements that mean this ticket is done."],
          ],
        }) as Record<string, [string, string][]>
      )[kind] ?? [],
    emptyContent: "A template needs content — write some markdown or import a file.",
    deleteConfirmTitle: "Remove template",
    deleteConfirmBody: (name: string) =>
      `Remove ${name}? Documents already created from it are not affected.`,
    switcherLabel: "Template",
    switcherLocked:
      "Templates can only be switched while the document is an unedited template — content is already written.",
    appliedSummary: (name: string) => `Applied template: ${name}`,
    conversionGuidance: (templateMarkdown: string) =>
      `Structure the generated document following this template — keep its sections, replacing each guidance line with real content:\n\n${templateMarkdown}`,
    ticketGuidance: (ticketMarkdown: string) =>
      `Each individual ticket description should follow this structure:\n\n${ticketMarkdown}`,
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
    kindFile: "File upload",
    kindShort: (kind: string) =>
      (({ url: "URL", github_code: "GH", spec: "SPEC", file: "FILE" }) as Record<string, string>)[
        kind
      ] ?? kind,
    titlePlaceholder: "Title",
    urlPlaceholder: "https://…",
    githubPlaceholder: "https://github.com/owner/repo/blob/main/path/to/file.ts",
    specIdPlaceholder: "Spec ID (from the spec URL)",
    fileLabel: "File (up to 10 MB)",
    remove: "Remove",
    addButton: "+ Add",
    previewTitle: "Reference preview",
    previewUnsupported: "No inline preview for this file type — download it instead.",
    previewLoading: "Loading preview…",
    download: "Download",
  },
  workspace: {
    titleBlock: {
      spec: "Spec",
      project: "Project",
      phase: "Phase",
      rev: "Rev",
    },
    outline: "Outline",
    outlineEmpty: "Headings will appear here as the document grows.",
    collapsePanel: "Collapse panel",
    expandPanel: "Expand panel",
    attachments: "Attachments",
    reading: "Reading",
    editing: "Edit",
    commentStub: "Commenting unavailable",
    commentsHeading: "Comments",
    commentsEmpty: "No comments yet — hover a block and press + to start a thread.",
    commentsResolved: "Resolved",
    aiPill: "✦ Ask AI",
    aiCollapse: "Hide",
    emptySheet: "This spec is blank — switch to Edit or ask AI to draft it.",
    commentAdd: "Comment on this block",
  },
  members: {
    heading: "Members",
    title: pageTitle("Members"),
    tagline: "Everyone in this workspace, and pending invites.",
    inviteHeading: "Invite a member",
    emailPlaceholder: "colleague@example.com",
    roleLabel: "Role",
    invite: "Send invite",
    pendingHeading: "Pending invites",
    inviteLinkLabel: "Invite link",
    noPending: "No pending invites.",
    expired: "expired",
  },
  invite: {
    heading: (workspace: string) => `Join ${workspace} on ${APP_NAME}`,
    tagline: "Set up your account to accept the invite.",
    title: pageTitle("Join"),
    role: (role: string) => `You are joining as ${role}.`,
    accept: "Join workspace",
    invalid: "This invite link is invalid, expired, or already used.",
  },
  comments: {
    heading: "Review",
    summary: (open: number, resolved: number) => `${open} open · ${resolved} resolved`,
    commentOn: "Comment",
    post: "Post",
    reply: "Reply",
    resolve: "Resolve",
    reopen: "Reopen",
    resolved: "Resolved",
    open: "Open",
    placeholder: "Write a comment…",
    replyPlaceholder: "Write a reply…",
    empty: "No comments yet — select a block below to start a thread.",
    noBlocks: "Save a first version to start reviewing.",
    threadCount: (n: number) => (n === 1 ? "1 thread" : `${n} threads`),
    composerHeading: "New comment",
    cancel: "Cancel",
    actionFailed: (detail: string) => `Couldn't update the thread — ${detail}`,
    selectHint: "Hover a block in the document and click + to start a thread.",
  },
  connectors: {
    heading: "Connectors",
    on: "On",
    connect: "Connect",
    soon: "Soon",
    github: "GitHub",
    githubDetail: "Docs & issues export",
    drive: "Google Drive",
    driveDetail: "Reference sync",
    confluence: "Confluence",
    confluenceDetail: "Spec sync",
    jira: "Jira",
    jiraDetail: "Task export",
  },
  integrations: {
    heading: "Integrations",
    tagline:
      "Connect this project to the tools your team ships with. Tokens are encrypted at rest.",
    githubHeading: "GitHub",
    connected: (repo: string) => `Connected to ${repo}`,
    ownerPlaceholder: "Owner (e.g. worldofpasa)",
    repoPlaceholder: "Repository (e.g. product-specs)",
    branchPlaceholder: "Branch (default branch if empty)",
    basePathPlaceholder: "Folder for exported specs (default: specs)",
    tokenPlaceholder: "Personal access token (repo scope)",
    tokenStored: "token stored (encrypted)",
    connect: "Connect GitHub",
    disconnect: "Disconnect",
    none: "No integrations connected yet.",
  },
  export: {
    title: (spec: string) => pageTitle("Export", spec),
    crumb: "export",
    heading: "Export",
    needsIntegration: "Connect a GitHub integration on the project page first.",
    needsFrozen: "Freeze this spec to enable exporting — exports always ship a pinned version.",
    docHeading: "Spec document → GitHub",
    docExplainer: (repo: string) =>
      `Commits the frozen document as markdown to ${repo} (updated in place on re-export).`,
    docButton: "Export document",
    tasksHeading: "Epics & tasks → GitHub Issues",
    tasksExplainer:
      "Structure the tasks document into epics first, review the grouping, then create one issue per epic (updated in place on re-export).",
    structureButton: "Structure into epics",
    restructureButton: "Re-structure from document",
    tasksButton: "Create GitHub issues",
    tasksOnly: "Task export is available for TASKS-phase specs.",
    epicsEmpty: "No epics yet — structure the document to preview the grouping.",
    epicTaskCount: (n: number) => (n === 1 ? "1 task" : `${n} tasks`),
    removeEpic: "Remove",
    exportedHeading: "Export records",
    exportedEmpty: "Nothing exported yet.",
    exportedDoc: "Document",
    exportedIssue: "Issue",
    reExportNote: "Re-exporting updates the same file and issues — no duplicates.",
    restructuredNotice: (n: number) =>
      `${n === 1 ? "1 issue was" : `${n} issues were`} previously exported from the old structure. Re-exporting creates fresh issues; the old GitHub issues remain and may need manual closing.`,
    lastExported: (when: string) => `last exported ${when}`,
  },
  presence: {
    viewing: (name: string) => `${name} is viewing`,
    label: "Currently viewing",
    more: (n: number) => `+${n}`,
  },
  interview: {
    heading: "Interview",
    tagline: "Sharpen this idea with the local claude CLI — nothing leaves this machine.",
    skillLabel: "Approach",
    skills: {
      grilling: "Grill me",
      grillingDetail: "Relentless questions, one at a time, sharpening the document as you answer",
      wayfinder: "Wayfinder",
      wayfinderDetail: "Map the big decisions in a foggy idea, then resolve them one by one",
    },
    promptPlaceholder: "Describe the rough idea to kick things off…",
    start: "Start interview",
    working: "Interviewing…",
    cancel: "Stop session",
    answer: "Answer",
    otherPlaceholder: "Or type your own answer…",
    docUpdated: "Document updated",
    transcript: "Transcript",
    doneInterview: "Interview finished — the sharpened draft was saved to your working draft.",
    doneConvert: "Document generated — opening the new spec…",
    claudeMissing:
      "Interviews need the claude CLI on this host and a Claude CLI provider configured in settings.",
    busy: "A session is already running on this spec.",
    convertHeading: "Generate with AI",
    convert: (phase: string) => `Generate ${phase} with AI`,
    unavailableInterview:
      "specpasa can interview you to sharpen this idea with the local claude CLI, but no Claude CLI provider is enabled for this workspace.",
    unavailableConvert: (phase: string) =>
      `specpasa can turn this frozen document into a first ${phase} draft with the local claude CLI, but no Claude CLI provider is enabled for this workspace.`,
    unavailableNoBinary:
      "Install the claude CLI on this host to unlock it, then enable it under AI Providers.",
    unavailableNoConfig: "Enable it under AI Providers to unlock generation.",
    unavailableCta: "Set up AI Providers →",
    convertTagline: (phase: string) =>
      `The claude CLI turns this frozen document into a first ${phase} version — it may ask a question or two along the way.`,
    badTicketFormat:
      "The generated tickets did not match the epics format — nothing was created. Try again.",
    sessionEnded: "Session ended.",
    failed: (detail: string) => `Session failed — ${detail}`,
  },
} as const;
