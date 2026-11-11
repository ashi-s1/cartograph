"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  User,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Sparkles,
} from "lucide-react";
import type { DetailPaneSelection } from "./detail-pane";
import { FormattedProse } from "./formatted-prose";

export interface ToolCallItem {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  status: "running" | "completed" | "failed";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallItem[];
  isStreaming?: boolean;
}

interface AskPanelProps {
  analysisId?: string;
  selection?: DetailPaneSelection;
  onSelectFile?: (filePath: string) => void;
  knownPaths?: Set<string>;
}

export function AskPanel({
  analysisId,
  selection,
  onSelectFile,
  knownPaths,
}: AskPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const selectedFilePath = selection?.type === "file" ? selection.file?.path : null;

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend || inputValue).trim();
      if (!query || isLoading) return;

      if (!analysisId) {
        setErrorMessage("Analysis ID is missing. Please reload the analysis.");
        return;
      }

      setErrorMessage(null);
      setInputValue("");

      // Prepare new user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: query,
      };

      // Prepare assistant placeholder message
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        toolCalls: [],
        isStreaming: true,
      };

      const updatedHistory = [...messages, userMessage];
      setMessages([...updatedHistory, assistantMessage]);
      setIsLoading(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Build payload messages for agent API
        const payloadMessages = updatedHistory.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId,
            messages: payloadMessages,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned ${res.status}`);
        }

        if (!res.body) {
          throw new Error("No response stream returned from agent service");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const block of lines) {
            const trimmed = block.trim();
            if (!trimmed) continue;

            let eventType = "message";
            let dataStr = "";

            const blockLines = trimmed.split("\n");
            for (const line of blockLines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataStr = line.slice(5).trim();
              }
            }

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== assistantMessageId) return msg;

                  if (eventType === "tool_start" || data.type === "tool_start") {
                    const toolName = data.tool || data.name || "graph_tool";
                    const newToolCall: ToolCallItem = {
                      id: `tool-${Date.now()}-${Math.random()}`,
                      name: toolName,
                      input: data.input,
                      status: "running",
                    };
                    return {
                      ...msg,
                      toolCalls: [...(msg.toolCalls || []), newToolCall],
                    };
                  }

                  if (eventType === "tool_end" || data.type === "tool_end") {
                    const toolName = data.tool || data.name;
                    return {
                      ...msg,
                      toolCalls: (msg.toolCalls || []).map((tc) =>
                        tc.name === toolName && tc.status === "running"
                          ? { ...tc, status: "completed", output: data.output }
                          : tc
                      ),
                    };
                  }

                  if (eventType === "token" || data.type === "token") {
                    const incomingToken = data.content || "";
                    return {
                      ...msg,
                      content: msg.content + incomingToken,
                    };
                  }

                  if (eventType === "error" || data.type === "error") {
                    return {
                      ...msg,
                      content: msg.content + `\n\n[Error: ${data.error || "Agent execution failed"}]`,
                      isStreaming: false,
                    };
                  }

                  if (eventType === "done" || data.type === "done") {
                    return {
                      ...msg,
                      isStreaming: false,
                    };
                  }

                  return msg;
                })
              );
            } catch (parseErr) {
              console.warn("Failed to parse SSE line:", parseErr, dataStr);
            }
          }
        }

        // Finalize streaming status
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
          )
        );
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content:
                    msg.content ||
                    `Agent is unavailable: ${message}. Make sure the agent service is running on port 3001.`,
                  isStreaming: false,
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [analysisId, inputValue, isLoading, messages]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setErrorMessage(null);
    setIsLoading(false);
  };

  return (
    <div className="flex h-full flex-col bg-[#0e1013]/90 text-zinc-200">
      {/* Ask Panel Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#0f1117] px-3">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
          <Bot className="h-3.5 w-3.5 text-sky-400" />
          <span>Cartograph Graph Agent</span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClearHistory}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Clear chat thread"
          >
            <Trash2 className="h-3 w-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Messages Thread Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 text-zinc-500">
            <Bot className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="font-mono text-xs text-zinc-300 font-medium">Ask Cartograph</p>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-[280px]">
              Ask structural questions. The agent looks up facts using AST graph tools before answering.
            </p>

            {/* Quick Suggestion Pills */}
            <div className="mt-4 flex flex-col gap-1.5 w-full max-w-[280px]">
              {selectedFilePath ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSend(`What breaks if I change ${selectedFilePath}?`)}
                    className="text-left rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors cursor-pointer truncate"
                  >
                    What breaks if I change this?
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend(`What does ${selectedFilePath} depend on?`)}
                    className="text-left rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors cursor-pointer truncate"
                  >
                    What does this depend on?
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSend("Where is authentication handled?")}
                    className="text-left rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors cursor-pointer"
                  >
                    Where is authentication handled?
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend("Give me an overview of the repository structure.")}
                    className="text-left rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors cursor-pointer"
                  >
                    Give me an overview of the repository
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend("What are the main entrypoints and routes?")}
                    className="text-left rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors cursor-pointer"
                  >
                    What are the main entrypoints and routes?
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="space-y-1.5">
              {/* Message Header */}
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
                {msg.role === "user" ? (
                  <>
                    <User className="h-3 w-3 text-zinc-400" />
                    <span>You</span>
                  </>
                ) : (
                  <>
                    <Bot className="h-3 w-3 text-sky-400" />
                    <span>Cartograph Agent</span>
                  </>
                )}
              </div>

              {/* Tool Calls Stream Section */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="space-y-1 my-1.5">
                  {msg.toolCalls.map((tc) => (
                    <div
                      key={tc.id}
                      className="flex items-center gap-2 rounded border border-zinc-800/90 bg-zinc-950/70 px-2 py-1 font-mono text-[10px] text-zinc-300"
                    >
                      <Wrench className="h-3 w-3 text-sky-400 shrink-0" />
                      <span className="font-semibold text-sky-300">{tc.name}</span>
                      <span className="text-zinc-500 truncate flex-1">
                        {typeof tc.input === "object"
                          ? JSON.stringify(tc.input)
                          : String(tc.input || "")}
                      </span>
                      {tc.status === "running" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-sky-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Message Content */}
              {msg.content ? (
                <div className="rounded-md border border-zinc-800/60 bg-zinc-900/40 p-3 text-zinc-200 leading-relaxed font-sans select-text">
                  {knownPaths && onSelectFile ? (
                    <FormattedProse
                      content={msg.content}
                      knownPaths={knownPaths}
                      onSelectPath={onSelectFile}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap text-xs">{msg.content}</div>
                  )}

                  {/* Contextual Follow-Up Suggestions After Assistant Message */}
                  {!msg.isStreaming && msg.role === "assistant" && (
                    <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex flex-wrap gap-1">
                      {selectedFilePath ? (
                        <>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleSend("What breaks if I change or remove this file?")}
                            className="inline-flex items-center gap-1 rounded bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 font-mono text-[10px] text-sky-300 hover:bg-sky-900/70 hover:text-sky-100 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Sparkles className="h-2.5 w-2.5 text-sky-400" />
                            <span>What breaks if I change or remove this file?</span>
                          </button>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleSend(`What does ${selectedFilePath} depend on?`)}
                            className="inline-flex items-center gap-1 rounded bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <span>What does this depend on?</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleSend("What are the key entrypoints?")}
                            className="inline-flex items-center gap-1 rounded bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <span>What are the key entrypoints?</span>
                          </button>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleSend("What does the route table look like?")}
                            className="inline-flex items-center gap-1 rounded bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <span>What does the route table look like?</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : msg.isStreaming ? (
                <div className="flex items-center gap-2 py-1 text-zinc-500 text-[11px] font-mono">
                  <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
                  <span>Looking up graph dependencies...</span>
                </div>
              ) : null}
            </div>
          ))
        )}

        {errorMessage && (
          <div className="flex items-start gap-2 rounded border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-rose-300 text-[11px]">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium">Connection Error</p>
              <p className="text-rose-400/90">{errorMessage}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Prompt Footer Matching Tutorial Layout */}
      <div className="border-t border-zinc-800/80 bg-[#0c0d12] p-2.5">
        {selectedFilePath && (
          <div className="mb-2 flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/80 px-2.5 py-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
              <span className="text-zinc-500 font-mono text-[10px]">With</span>
              <span className="font-mono text-zinc-200 font-medium truncate max-w-[170px]" title={selectedFilePath}>
                {selectedFilePath}
              </span>
              <span className="text-zinc-500 font-mono text-[10px]">selected</span>
            </div>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSend("What breaks if I change or remove this file?")}
              className="inline-flex items-center gap-1 rounded bg-sky-950/70 border border-sky-800/60 px-2 py-0.5 font-mono text-[10px] text-sky-300 hover:bg-sky-900/80 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              title="Automatically ask about impact of changing this file"
            >
              <Sparkles className="h-2.5 w-2.5 text-sky-400" />
              <span>What breaks?</span>
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            rows={2}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this repository"
            disabled={isLoading}
            className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-sans text-xs text-zinc-200 placeholder-zinc-500 focus:border-sky-500 focus:outline-hidden disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="h-full rounded-md bg-sky-600 px-3.5 py-2 font-mono text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-30 disabled:hover:bg-sky-600 transition-colors cursor-pointer shrink-0 flex items-center justify-center gap-1 shadow-xs"
            title="Ask (Enter)"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span>Ask</span>
            )}
          </button>
        </form>
        <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-zinc-500 font-mono">
          <span>Enter to send, Shift+Enter for newline</span>
          <span>Grounded in AST Graph</span>
        </div>
      </div>
    </div>
  );
}
