/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import { useMessageStore } from '../../stores/messageStore';

interface MessageFeedbackProps {
  uuid: string;
}

const ThumbUpIcon: FC<{ active: boolean }> = ({ active }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill={active ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

const ThumbDownIcon: FC<{ active: boolean }> = ({ active }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill={active ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
    <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
  </svg>
);

export const MessageFeedback: FC<MessageFeedbackProps> = ({ uuid }) => {
  const feedback = useMessageStore((s) => s.messageFeedback[uuid]);
  const setMessageFeedback = useMessageStore((s) => s.setMessageFeedback);

  return (
    <div
      className="message-feedback flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      style={{ height: '20px' }}
    >
      <button
        type="button"
        onClick={() => setMessageFeedback(uuid, 'up')}
        title="Helpful"
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          cursor: 'pointer',
          color: feedback === 'up' ? '#e8e6e3' : '#555',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '3px',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (feedback !== 'up')
            (e.currentTarget as HTMLButtonElement).style.color = '#8a8a8a';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            feedback === 'up' ? '#e8e6e3' : '#555';
        }}
      >
        <ThumbUpIcon active={feedback === 'up'} />
      </button>
      <button
        type="button"
        onClick={() => setMessageFeedback(uuid, 'down')}
        title="Not helpful"
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          cursor: 'pointer',
          color: feedback === 'down' ? '#e8e6e3' : '#555',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '3px',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (feedback !== 'down')
            (e.currentTarget as HTMLButtonElement).style.color = '#8a8a8a';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            feedback === 'down' ? '#e8e6e3' : '#555';
        }}
      >
        <ThumbDownIcon active={feedback === 'down'} />
      </button>
    </div>
  );
};
