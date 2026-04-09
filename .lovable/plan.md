

# Create CLAUDE.md

The user wants a `CLAUDE.md` file — this is a project context file used by Claude (the AI) to understand the codebase quickly. It differs from README.md by being oriented toward an AI assistant rather than a human developer.

## What I'll do

Create a `CLAUDE.md` file at the project root that includes:

1. **Project summary** — What SponsorScout does in 1-2 sentences
2. **Architecture overview** — Key files, directory structure, how components connect
3. **Workflow pipeline** — The 5-step flow and how data moves between steps
4. **Edge functions** — What each one does, data sources (Eventbrite → JinaAI → sample fallback)
5. **AI integration** — Lovable AI Gateway, model used, fallback behavior
6. **Key conventions** — State management via `useSponsorWorkflow`, types in `sponsor.ts`, shadcn/ui components
7. **Known limitations** — No Meetup API, Eventbrite key not configured, no database persistence yet
8. **Important files** — Quick reference to the most important files to read first

This will be a single new file creation with no other changes needed.

