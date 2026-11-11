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

## Quickstart (Running Locally)

### 1. Install Dependencies
```bash
# Install root web app dependencies
pnpm install

# Install agent service dependencies
cd agent && pnpm install && cd ..
```

### 2. Start the Servers

You will need **two terminal tabs/windows**:

#### Terminal 1 — Start Web Application (Port 3000)
```bash
pnpm dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to access the dashboard and interactive canvas.

#### Terminal 2 — Start Agent Service (Port 3001)
```bash
pnpm agent
```
*Alternatively, you can run `cd agent && pnpm start`.*

Once running, you will see:
```text
=========================================
 Cartograph Agent Server running on http://127.0.0.1:3001
 Health endpoint: http://127.0.0.1:3001/health
 Registered 6 graph analysis tools
=========================================
```

---

## Using the Ask Section

1. Navigate to any analysis in your browser (`http://localhost:3000/analyses/[id]`).
2. At the top of the right-hand pane, click the **Ask** tab (switches mode between **Overview** and **Ask**).
3. Try asking:
   - *"Where is authentication handled?"*
   - *"What breaks if I change or remove this file?"* (multi-turn follow-up with a file selected)
   - *"What does the route table look like?"*
4. Watch the agent stream tool calls in real time (`search_files`, `file_neighbors`, `transitive_walk`) and provide grounded answers with clickable repository file links that focus directly on the canvas graph.

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
