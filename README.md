# Cartograph 🧭

Visual codebase architecture and dependency mapper with grounded AST graph intelligence.

Cartograph parses TypeScript/JavaScript codebases into interactive topological dependency graphs, extracts declared routes, computes structural metrics (fan-in/fan-out, cycle detection, blast radius), and provides an interactive AI Deep Agent that answers questions grounded strictly in AST graph analysis tools.

---

## Architecture: Two Server Services

Cartograph consists of two complementary services that run simultaneously:

```
┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
│         Next.js Web Application         │       │         Cartograph Deep Agent           │
│         http://localhost:3000           │       │         http://localhost:3001           │
│                                         │       │                                         │
│  • Visual React Flow / Dagre canvas     │  SSE  │  • Deep Agent runtime (deepagents)      │
│  • File details & structural insights   │◄─────►│  • 6 AST graph analysis tools           │
│  • Overview pane (Structure / Explain)  │ Stream│  • Grounded path citation engine        │
│  • Clerk Auth & Supabase sync           │       │  • Pinned to Gemini / GPT-4o            │
└─────────────────────────────────────────┘       └─────────────────────────────────────────┘
```

| Service | Port | Terminal Command | What It Displays & Powers |
| :--- | :--- | :--- | :--- |
| **Web Application** | `http://localhost:3000` | `pnpm dev` | **The Main User Interface**: Interactive canvas graph, categories sidebar, file structure, architectural explanations, route tables, and Clerk authentication. |
| **Agent Backend** | `http://localhost:3001` | `pnpm agent` | **The Ask Section**: Answers questions in the Ask tab, executes AST graph tools (`search_files`, `file_neighbors`, `transitive_walk`, etc.), and streams real-time tool badges and tokens. |

> **Resilience Guarantee:** When the agent service (`port 3001`) is stopped or offline, the main application (`port 3000`) remains 100% operational for canvas exploration, structural metrics, and explanations.

---

## Prerequisites & Environment Setup

Create a `.env.local` file in the project root:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# AI Model Provider (for Deep Agent & Explanations)
GOOGLE_API_KEY=your-google-ai-studio-api-key # Pinned model: gemini-3.5-flash-lite
# or
OPENAI_API_KEY=your-openai-api-key           # Fallback model: gpt-4o

# LangSmith Tracing (Optional)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_PROJECT=cartograph
LANGSMITH_API_KEY=your-langsmith-key
```

---

## Quickstart: How to Run the App & Access the Agent

To use the Cartograph interface and converse with the AI agent, you must run **both** services in separate terminal windows:

### 1. Install Dependencies (First Time Only)
```bash
# Install root web app dependencies
pnpm install

# Install agent service dependencies
cd agent && pnpm install && cd ..
```

### 2. Start the Agent Service (Terminal 1)
```bash
pnpm agent
```
- **Port:** `http://localhost:3001`
- **Role:** Headless AI agent backend that executes AST graph analysis tools (`repo_summary`, `file_neighbors`, `transitive_walk`, etc.) and streams answers back to the UI.

### 3. Start the Web Dev Server (Terminal 2)
```bash
pnpm dev
```
- **Port:** `http://localhost:3000`
- **Role:** Main visual user interface with interactive canvas graph, repository explorer, and the agent chat panel.

---

## How to Access the Agent Conversation

Once both servers are running:

1. Open your browser and go to **[http://localhost:3000](http://localhost:3000)**.
2. Open your repository analysis (e.g., `http://localhost:3000/analyses/<your-analysis-id>`).
3. In the right-hand panel, click the **Ask** tab (located next to *Overview*).
4. Enter any question about your codebase into the input box:
   - *"What are the key entrypoints?"*
   - *"Where is authentication handled?"*
   - *"What breaks if I change or remove this file?"*
   - *"What does the route table look like?"*
5. The agent will query the AST graph, cite verified file paths with clickable canvas links, and stream its response in real time!

> **Note:** If you navigate directly to `http://localhost:3001` in your browser, you will see the Agent Service Status Dashboard. The chat conversation lives inside the Cartograph web UI at `http://localhost:3000` under the **Ask** tab.

---

## CLI & Evaluation Scripts

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Runs Next.js web application with Turbopack |
| `pnpm agent` | Runs the Cartograph Deep Agent HTTP service on port 3001 |
| `pnpm agent-key` | Mints a short-lived HMAC-signed credential for an analysis |
| `pnpm parse <dir>` | Runs the TypeScript AST parser directly on a directory |
| `pnpm eval:prompts` | Runs LangSmith prompt comparison evaluations |
| `pnpm eval:paths` | Evaluates invented path hallucination rates |
| `pnpm eval:roles` | Evaluates file classification accuracy |
| `pnpm evals` | Runs the complete evaluation test suite |

---

## License

MIT
