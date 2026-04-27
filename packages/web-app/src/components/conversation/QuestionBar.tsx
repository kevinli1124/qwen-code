/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, type FC } from 'react';

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

export const QuestionBar: FC<QuestionBarProps> = ({
  questions,
  onSubmit,
  onCancel,
}) => {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [customText, setCustomText] = useState('');

  const question = questions[questionIndex];
  const isLast = questionIndex === questions.length - 1;

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

  if (!question) return null;

  const currentSelections = answers[questionIndex] ?? [];

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
        const result: Record<string, string> = {};
        questions.forEach((_, i) => {
          const sel = i === questionIndex ? [label] : (next[i] ?? []);
          if (sel.length > 0) result[String(i)] = sel.join(', ');
        });
        onSubmit(result);
      } else {
        setQuestionIndex(questionIndex + 1);
        setCustomText('');
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
        const result: Record<string, string> = {};
        questions.forEach((_, i) => {
          const sel = i === questionIndex ? [val] : (next[i] ?? []);
          if (sel.length > 0) result[String(i)] = sel.join(', ');
        });
        onSubmit(result);
      } else {
        setQuestionIndex(questionIndex + 1);
      }
    }
  };

  const submitMulti = () => {
    if (isLast) {
      const result: Record<string, string> = {};
      questions.forEach((_, i) => {
        const sel = answers[i] ?? [];
        if (sel.length > 0) result[String(i)] = sel.join(', ');
      });
      onSubmit(result);
    } else {
      setQuestionIndex(questionIndex + 1);
      setCustomText('');
    }
  };

  return (
    <div className="border-t border-accent/25 bg-[#1a1a1a] px-4 py-3 animate-fade-up">
      {/* Tab row for multi-question flows */}
      {questions.length > 1 && (
        <div className="flex gap-1.5 mb-2 overflow-x-auto">
          {questions.map((q, i) => (
            <button
              key={i}
              onClick={() => setQuestionIndex(i)}
              className={[
                'px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors',
                i === questionIndex
                  ? 'bg-accent text-white'
                  : 'bg-[#2e2e2e] text-[#8a8a8a] hover:text-[#e8e6e3]',
              ].join(' ')}
            >
              {q.header}
              {(answers[i]?.length ?? 0) > 0 && (
                <span className="ml-1 text-green-400">✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Question text */}
      <div className="mb-2.5">
        {questions.length === 1 && (
          <div className="text-xs font-semibold text-accent mb-0.5">
            {question.header}
          </div>
        )}
        <div className="text-sm text-[#e8e6e3]">{question.question}</div>
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-2 mb-2">
        {question.options.map((opt) => {
          const selected = currentSelections.includes(opt.label);
          return (
            <button
              key={opt.label}
              onClick={() => selectOption(opt.label)}
              title={opt.description || undefined}
              className={[
                'px-3 py-1.5 rounded text-xs font-medium border transition-colors',
                selected
                  ? 'bg-accent/20 border-accent/60 text-accent'
                  : 'bg-[#2e2e2e] border-[#3e3e3e] text-[#e8e6e3] hover:border-accent/40 hover:bg-[#3e3e3e]',
              ].join(' ')}
            >
              {question.multiSelect && (
                <span className="mr-1.5 text-[10px]">
                  {selected ? '☑' : '☐'}
                </span>
              )}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Custom input row + footer controls */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitCustom();
            }
          }}
          placeholder="Other…"
          className="flex-1 bg-[#242424] border border-[#3e3e3e] rounded px-2.5 py-1 text-xs text-[#e8e6e3] placeholder:text-[#5a5a5a] focus:outline-none focus:border-accent/50"
        />
        {question.multiSelect && (
          <button
            onClick={submitMulti}
            disabled={currentSelections.length === 0 && !customText.trim()}
            className="px-3 py-1 rounded bg-accent text-white text-xs font-medium disabled:opacity-40 hover:bg-accent-hover transition-colors"
          >
            {isLast ? 'Submit' : 'Next'}
          </button>
        )}
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded bg-[#2e2e2e] text-[#8a8a8a] text-xs hover:text-[#e8e6e3] transition-colors"
        >
          Cancel
        </button>
        <span className="text-[10px] text-[#5a5a5a] hidden sm:block">
          Esc to cancel
        </span>
      </div>
    </div>
  );
};
