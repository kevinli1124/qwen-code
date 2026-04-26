import { useCallback, useEffect, useRef } from 'react';

// Append the xterm stylesheet once per page load; re-entrant safe.
let xtermCssInjected = false;
function ensureXtermCss() {
  if (xtermCssInjected) return;
  xtermCssInjected = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('@xterm/xterm/css/xterm.css', import.meta.url).href;
  document.head.appendChild(link);
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let term: import('@xterm/xterm').Terminal;
    let fitAddon: import('@xterm/addon-fit').FitAddon;

    async function init() {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      ensureXtermCss();

      term = new Terminal({
        theme: {
          background: '#0f0f0f',
          foreground: '#e8e6e3',
          cursor: '#4f6bff',
          selectionBackground: 'rgba(79, 107, 255, 0.3)',
        },
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: false,
        scrollback: 5000,
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      if (containerRef.current) {
        term.open(containerRef.current);
        fitAddon.fit();
      }
      termRef.current = term;
    }

    void init();

    const observer = new ResizeObserver(() => {
      fitAddon?.fit();
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term?.dispose();
      termRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const write = useCallback((text: string) => {
    termRef.current?.write(text);
  }, []);

  const clear = useCallback(() => {
    termRef.current?.clear();
  }, []);

  return { write, clear };
}
