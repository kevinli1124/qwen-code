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
 * Inline question bar — sits where the InputBar normally lives and never
 * obscures the conversation above.
 *
 * Layout (vertical list, industry standard agent UX):
 *   ┌──────────────────────────────┐
 *   │ Header · question text       │   ← compact title row
 *   ├──────────────────────────────┤
 *   │ ○  Option A                  │   ← vertical option list
 *   │    description text          │
 *   │ ○  Option B                  │
 *   │ …                            │
 *   ├──────────────────────────────┤
 *   │ [Other input]   [Cancel]     │   ← action row
 *   └──────────────────────────────┘
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

  // Reset custom input when question changes
  useEffect(() => {
    setCustomText('');
    setShowCustom(false);
  }, [questionIndex]);

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
    setShowCustom(false);
    if (!question.multiSelect) {
      if (isLast) {
        onSubmit(buildResult(questionIndex, val, next));
      } else {
        setQuestionIndex(questionIndex + 1);
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
    }
  };

  return (
    <div className="border-t border-[#2e2e2e] bg-[#1a1a1a] flex flex-col max-h-[55vh]">
      {/* ── Title row ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2e2e2e] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-[#e8e6e3] truncate">
            {question.header}
          </span>
          {questions.length > 1 && (
            <div className="flex gap-1 ml-1">
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setQuestionIndex(i)}
                  className={[
                    'w-1.5 h-1.5 rounded-full transition-colors',
                    i === questionIndex ? 'bg-accent' : 'bg-[#3e3e3e]',
                  ].join(' ')}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <span className="text-[11px] text-[#8a8a8a] hidden sm:block truncate max-w-[240px]">
            {question.question}
          </span>
          <button
            onClick={onCancel}
            className="text-[11px] text-[#5a5a5a] hover:text-[#e8e6e3] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* ── Vertical option list (scrollable) ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Question text shown inside list area on mobile */}
        <div className="px-4 pt-2 pb-1 text-[11px] text-[#8a8a8a] sm:hidden">
          {question.question}
        </div>

        <div className="px-3 py-1.5 flex flex-col gap-0.5">
          {question.options.map((opt) => {
            const selected = currentSelections.includes(opt.label);
            return (
              <button
                key={opt.label}
                onClick={() => selectOption(opt.label)}
                className={[
                  'group w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all',
                  selected
                    ? 'bg-accent/10 border border-accent/30'
                    : 'hover:bg-[#242424] border border-transparent',
                ].join(' ')}
              >
                {/* Selection indicator */}
                <span
                  className={[
                    'flex-shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors',
                    selected
                      ? 'border-accent bg-accent'
                      : 'border-[#4a4a4a] group-hover:border-accent/60',
                    question.multiSelect ? 'rounded' : 'rounded-full',
                  ].join(' ')}
                >
                  {selected && (
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      className="text-white"
                    >
                      {question.multiSelect ? (
                        <path
                          d="M1.5 4l2 2 3-3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <circle cx="4" cy="4" r="2.5" fill="currentColor" />
                      )}
                    </svg>
                  )}
                </span>

                {/* Label + description */}
                <div className="flex-1 min-w-0">
                  <div
                    className={[
                      'text-sm font-medium leading-tight',
                      selected ? 'text-accent' : 'text-[#e8e6e3]',
                    ].join(' ')}
                  >
                    {opt.label}
                  </div>
                  {opt.description && (
                    <div className="text-[11px] text-[#6a6a6a] mt-0.5 leading-snug">
                      {opt.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Action row: custom input + confirm/cancel ── */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-[#2e2e2e] flex items-center gap-2">
        {showCustom ? (
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
            placeholder="Type your answer and press Enter…"
            className="flex-1 bg-[#242424] border border-accent/40 rounded-lg px-3 py-1.5 text-sm text-[#e8e6e3] placeholder:text-[#5a5a5a] focus:outline-none focus:border-accent/60"
          />
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#3e3e3e] text-xs text-[#5a5a5a] hover:text-[#e8e6e3] hover:border-[#5a5a5a] transition-colors"
          >
            <span>+</span>
            <span>Other…</span>
          </button>
        )}

        {customText.trim() && showCustom && (
          <button
            onClick={submitCustom}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
          >
            Submit
          </button>
        )}

        {question.multiSelect && (
          <button
            onClick={submitMulti}
            disabled={currentSelections.length === 0 && !customText.trim()}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-40 hover:bg-accent-hover transition-colors ml-auto"
          >
            {isLast ? 'Done' : 'Next →'}
          </button>
        )}

        <span className="text-[10px] text-[#3e3e3e] ml-auto flex-shrink-0">
          Esc to cancel
        </span>
      </div>
    </div>
  );
};
