/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * First-run onboarding settings. Controls whether the agent should prompt
 * for a basic user profile on the first session and whether it may
 * follow-up with targeted questions when it detects missing fields later.
 */
export interface OnboardingSettings {
  enabled: boolean;
  /** Minimum required questions before the profile can be saved. */
  minQuestions: number;
  /** If true, follow up with targeted questions when a gap is detected. */
  askOnGap: boolean;
}

export const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = {
  enabled: true,
  minQuestions: 1,
  askOnGap: true,
};

/**
 * Canonical keys tracked in the user_profile memory body. Order is
 * preserved when the onboarding prompt is rendered; optional keys come
 * after required ones.
 */
export interface ProfileQuestion {
  key: string;
  prompt: string;
  required: boolean;
}

export const DEFAULT_PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    key: 'name',
    prompt: 'What should I call you?',
    required: true,
  },
  {
    key: 'role',
    prompt:
      "What's your primary role? (e.g. solo developer, data scientist, student)",
    required: false,
  },
  {
    key: 'reply_style',
    prompt: 'Preferred reply style — concise, detailed, or default?',
    required: false,
  },
  {
    key: 'language',
    prompt:
      'Preferred language — Traditional Chinese, Simplified Chinese, English, or auto-detect?',
    required: false,
  },
];
