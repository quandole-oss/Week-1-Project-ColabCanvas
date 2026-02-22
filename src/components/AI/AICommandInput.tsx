import { useState, useRef, useEffect } from 'react';

interface AICommandInputProps {
  onSubmit: (command: string) => void;
  isProcessing: boolean;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function AICommandInput({ onSubmit, isProcessing, messages, inputRef }: AICommandInputProps) {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isProcessing) { setElapsedSec(0); return; }
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSubmit(input.trim());
      setInput('');
      setIsExpanded(true);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="absolute bottom-4 right-4 w-80 z-40">
      {/* Messages panel */}
      {isExpanded && messages.length > 0 && (
        <div className="bg-white/80 backdrop-blur-md rounded-t-lg border border-b-0 border-white/30 mb-0 relative shadow-lg">
          {/* Sticky close button - always visible at top right */}
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute top-1.5 right-1.5 w-5 h-5 bg-gray-200/80 hover:bg-gray-300/80 text-gray-500 hover:text-gray-700 rounded-full flex items-center justify-center text-xs z-10 transition"
            title="Minimize"
            aria-label="Minimize chat"
          >
            ✕
          </button>
          <div className="px-2.5 py-1.5 border-b border-white/30">
            <span className="text-xs text-gray-700 font-medium">AI Assistant</span>
          </div>
          <div className="p-2 space-y-2 max-h-40 overflow-y-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-xs ${
                  msg.role === 'user' ? 'text-blue-600' : 'text-gray-700'
                }`}
              >
                <span className="font-medium">
                  {msg.role === 'user' ? 'You: ' : 'AI: '}
                </span>
                <span className="whitespace-pre-wrap">{msg.content}</span>
              </div>
            ))}
            <div aria-live="polite" className="text-gray-500 text-xs">
              {isProcessing && (
                <div className="flex items-center gap-1.5">
                  <span className="animate-pulse motion-reduce:animate-none">●</span>
                  Thinking{elapsedSec >= 3 ? ` (${elapsedSec}s)` : '\u2026'}
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        className={`bg-white/80 backdrop-blur-md border border-white/30 shadow-xl flex items-center gap-1.5 p-1.5 ${
          isExpanded && messages.length > 0 ? 'rounded-b-lg' : 'rounded-lg'
        }`}
      >
        <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-sm">
          <span className="text-white text-[10px] font-medium">AI</span>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"Ask AI\u2026 (\u2318K)"}
          className="flex-1 bg-transparent border-none text-gray-800 placeholder-gray-400 text-xs min-w-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
          disabled={isProcessing}
        />
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          className="px-2.5 py-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white text-xs rounded-md transition shadow-sm"
        >
          {isProcessing ? '\u2026' : 'Send'}
        </button>
        {messages.length > 0 && !isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="px-1.5 py-1 text-gray-500 hover:text-gray-700 text-xs transition"
            aria-label="Expand chat history"
          >
            ↑
          </button>
        )}
      </form>

      {/* Quick commands - show only when collapsed and no messages */}
      {!isExpanded && messages.length === 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 justify-end">
          {[
            'Blue rect',
            'Grid 3x3',
            'Cluster notes',
          ].map((cmd) => (
            <button
              key={cmd}
              onClick={() => {
                const fullCmd = cmd === 'Blue rect' ? 'Create a blue rectangle'
                  : cmd === 'Grid 3x3' ? 'Create a 3x3 grid'
                  : 'Cluster these sticky notes by theme';
                setInput(fullCmd);
                onSubmit(fullCmd);
                setIsExpanded(true);
              }}
              disabled={isProcessing}
              className="px-2 py-1 bg-white/60 hover:bg-white/80 text-gray-600 text-[10px] rounded-md border border-white/30 shadow-sm backdrop-blur-sm transition"
            >
              {cmd}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
