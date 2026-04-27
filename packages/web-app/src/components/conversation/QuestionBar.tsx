/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, type FC } from 'react';

interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface QuestionBarProps {
  questions: Question[];
  onSubmit: (answers: Record<string, string>) => void;
  onCancel: () => void;
}

/**
 * Inline question bar — replaces the InputBar at the bottom of the chat.
 *
 * Design principle: never obscure the conversation. The bar sits exactly
 * where the InputBar normally lives; the conversation scrolls above it.
 * Options are compact chips in a single scrollable row so the bar stays
 * within a normal input-area height (~80-100 px).
 */
export const QuestionBar: FC<QuestionBarProps> = ({
  questions,
  onSubmit,
  onCancel,
}) => {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [customText, setCustomText] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  const question = questions[questionIndex];
  const isLast = questionIndex === questions.length - 1;
  const currentSelections = answers[questionIndex] ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  useEffect(() => {
    if (showCustom) customInputRef.current?.focus();
  }, [showCustom]);

  if (!question) return null;

  const buildResult = (
    idx: number,
    val: string,
    snapshot: Record<number, string[]>,
  ): Record<string, string> => {
    const result: Record<string, string> = {};
    questions.forEach((_, i) => {
      const sel = i === idx ? [val] : (snapshot[i] ?? []);
      if (sel.length > 0) result[String(i)] = sel.join(', ');
    });
    return result;
  };

  const selectOption = (label: string) => {
    if (question.multiSelect) {
      const next = currentSelections.includes(label)
        ? currentSelections.filter((l) => l !== label)
        : [...currentSelections, label];
      setAnswers({ ...answers, [questionIndex]: next });
    } else {
      const next = { ...answers, [questionIndex]: [label] };
      setAnswers(next);
      if (isLast) {
        onSubmit(buildResult(questionIndex, label, next));
      } else {
        setQuestionIndex(questionIndex + 1);
        setCustomText('');
        setShowCustom(false);
      }
    }
  };

  const submitCustom = () => {
    const val = customText.trim();
    if (!val) return;
    const next = question.multiSelect
      ? { ...answers, [questionIndex]: [...currentSelections, val] }
      : { ...answers, [questionIndex]: [val] };
    setAnswers(next);
    setCustomText('');
    if (!question.multiSelect) {
      if (isLast) {
        onSubmit(buildResult(questionIndex, val, next));
      } else {
        setQuestionIndex(questionIndex + 1);
        setShowCustom(false);
      }
    }
  };

  const submitMulti = () => {
    const allAnswers = { ...answers };
    if (customText.trim()) {
      allAnswers[questionIndex] = [
        ...(allAnswers[questionIndex] ?? []),
        customText.trim(),
      ];
    }
    if (isLast) {
      const result: Record<string, string> = {};
      questions.forEach((_, i) => {
        const sel = allAnswers[i] ?? [];
        if (sel.length > 0) result[String(i)] = sel.join(', ');
      });
      onSubmit(result);
    } else {
      setQuestionIndex(questionIndex + 1);
      setCustomText('');
      setShowCustom(false);
    }
  };

  return (
    <div className="border-t border-[#2e2e2e] bg-[#1a1a1a] px-4 py-2.5">
      {/* ── Top row: question label + cancel ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* accent dot */}
          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />
          {/* header + question on one compact line */}
          <span className="text-[11px] font-medium text-accent truncate">
            {question.header}
          </span>
          <span className="text-[11px] text-[#8a8a8a] truncate hidden sm:block">
            {question.question}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {questions.length > 1 && (
            <span className="text-[10px] text-[#5a5a5a]">
              {questionIndex + 1}/{questions.length}
            </span>
          )}
          <button
            onClick={onCancel}
            className="text-[11px] text-[#5a5a5a] hover:text-[#e8e6e3] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* ── Options row: horizontally scrollable chips ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {question.options.map((opt) => {
          const selected = currentSelections.includes(opt.label);
          return (
            <button
              key={opt.label}
              onClick={() => selectOption(opt.label)}
              title={opt.description || undefined}
              className={[
                'flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap transition-all',
                selected
                  ? 'bg-accent/15 border-accent/50 text-accent'
                  : 'bg-[#242424] border-[#3e3e3e] text-[#c8c6c3] hover:border-accent/30 hover:text-[#e8e6e3]',
              ].join(' ')}
            >
              {question.multiSelect && (
                <span className="text-[9px] opacity-70">
                  {selected ? '▪' : '▫'}
                </span>
              )}
              {opt.label}
            </button>
          );
        })}

        {/* Other / custom input toggle */}
        {!showCustom ? (
          <button
            onClick={() => setShowCustom(true)}
            className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] border border-dashed border-[#3e3e3e] text-[#5a5a5a] hover:text-[#e8e6e3] hover:border-[#5a5a5a] whitespace-nowrap transition-colors"
          >
            + Other
          </button>
        ) : (
          <div className="flex-shrink-0 flex items-center gap-1">
            <input
              ref={customInputRef}
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitCustom();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowCustom(false);
                  setCustomText('');
                }
              }}
              placeholder="Type and press Enter…"
              className="w-48 bg-[#242424] border border-accent/40 rounded-full px-2.5 py-1 text-[11px] text-[#e8e6e3] placeholder:text-[#5a5a5a] focus:outline-none"
            />
            {customText.trim() && (
              <button
                onClick={submitCustom}
                className="flex-shrink-0 px-2 py-1 rounded-full bg-accent text-white text-[11px] font-medium hover:bg-accent-hover transition-colors"
              >
                ↵
              </button>
            )}
          </div>
        )}

        {/* Confirm button for multi-select */}
        {question.multiSelect && (
          <button
            onClick={submitMulti}
            disabled={currentSelections.length === 0 && !customText.trim()}
            className="flex-shrink-0 px-3 py-1 rounded-full bg-accent text-white text-[11px] font-medium disabled:opacity-40 hover:bg-accent-hover transition-colors ml-1"
          >
            {isLast ? 'Done' : 'Next →'}
          </button>
        )}
      </div>

      {/* Question text shown below on mobile (hidden on sm+) */}
      <div className="text-[10px] text-[#5a5a5a] mt-1.5 sm:hidden truncate">
        {question.question}
      </div>
    </div>
  );
};
