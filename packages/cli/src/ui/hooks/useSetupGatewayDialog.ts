/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

/**
 * Open / close state for the unified messaging-gateway setup dialog.
 *
 * One dialog, two entry points:
 *   - `/setup-gateway`          → `openSetupGatewayDialog()` (picker first)
 *   - `/setup-gateway telegram` → `openSetupGatewayDialog('telegram')` (skips picker)
 *
 * `setupGatewayInitialChannel` is read by `DialogManager` and passed into
 * the dialog so it knows whether to render the channel-selection step.
 */
export function useSetupGatewayDialog() {
  const [isSetupGatewayDialogOpen, setOpen] = useState(false);
  const [setupGatewayInitialChannel, setChannel] = useState<string | undefined>(
    undefined,
  );

  const openSetupGatewayDialog = useCallback((channel?: string) => {
    setChannel(channel);
    setOpen(true);
  }, []);

  const closeSetupGatewayDialog = useCallback(() => {
    setOpen(false);
    setChannel(undefined);
  }, []);

  return {
    isSetupGatewayDialogOpen,
    setupGatewayInitialChannel,
    openSetupGatewayDialog,
    closeSetupGatewayDialog,
  };
}
