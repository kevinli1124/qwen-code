/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC, ComponentType } from 'react';
import { PermissionDrawer } from '@qwen-code/webui';
import type { PermissionRequest } from '../../types/message';
import type { PermissionDrawerProps } from '@qwen-code/webui';

// Workaround for React 18/19 @types version mismatch between webui and web-app
const PermissionDrawerComp =
  PermissionDrawer as unknown as ComponentType<PermissionDrawerProps>;

interface PermissionModalProps {
  request: PermissionRequest;
  onRespond: (allowed: boolean) => void;
}

export const PermissionModal: FC<PermissionModalProps> = ({
  request,
  onRespond,
}) => {
  const options = [
    { name: 'Allow', kind: 'allow', optionId: 'allow' },
    { name: 'Deny', kind: 'deny', optionId: 'deny' },
  ];

  const toolCall = {
    title: request.toolName,
    toolCallId: request.toolUseId,
    rawInput: request.input,
    status: 'pending',
  };

  return (
    <PermissionDrawerComp
      isOpen={true}
      options={options}
      toolCall={toolCall}
      onResponse={(optionId) => onRespond(optionId === 'allow')}
    />
  );
};
