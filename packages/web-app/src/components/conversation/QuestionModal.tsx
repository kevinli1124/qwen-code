/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC, ComponentType } from 'react';
import { AskUserQuestionDialog } from '@qwen-code/webui';
import type { AskUserQuestionDialogProps, Question } from '@qwen-code/webui';

// Workaround for React 18/19 @types version mismatch between webui and web-app
const DialogComp =
  AskUserQuestionDialog as unknown as ComponentType<AskUserQuestionDialogProps>;

interface QuestionModalProps {
  questions: Question[];
  onSubmit: (answers: Record<string, string>) => void;
  onCancel: () => void;
}

export const QuestionModal: FC<QuestionModalProps> = ({
  questions,
  onSubmit,
  onCancel,
}) => (
  // Backdrop — keyboard handling (Enter to submit, Escape to cancel) is
  // managed inside AskUserQuestionDialog which already registers a keydown
  // listener on window. We keep the outer wrapper minimal.
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-[640px] max-w-[90vw] animate-fade-up">
      <DialogComp
        questions={questions}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
      {/* Keyboard hint */}
      <div className="mt-1 text-right text-[10px] text-[#5a5a5a] px-1">
        Press Esc to cancel
      </div>
    </div>
  </div>
);
