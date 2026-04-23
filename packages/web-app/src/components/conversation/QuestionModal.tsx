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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-[640px] max-w-[90vw]">
      <DialogComp
        questions={questions}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </div>
  </div>
);
