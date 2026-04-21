import { useCallback, useRef } from 'react';

export function useResizable(onResize: (delta: number) => void) {
  const dragRef = useRef(false);
  const startXRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = true;
      startXRef.current = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = startXRef.current - ev.clientX;
        startXRef.current = ev.clientX;
        onResize(delta);
      };

      const onMouseUp = () => {
        dragRef.current = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onResize],
  );

  return { onMouseDown };
}
