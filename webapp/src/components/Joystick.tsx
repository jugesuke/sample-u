import nipplejs from 'nipplejs';
import { useEffect, useRef, useState } from 'react';

const DEAD_ZONE = 0.08;
const MAX_SIZE = 300;

interface Props {
  /** x: 右が正, y: 上が正。どちらも -100〜100 */
  onChange: (x: number, y: number) => void;
}

export function Joystick({ onChange }: Props) {
  const zone = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const element = zone.current!;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      setSize(Math.min(MAX_SIZE, Math.floor(Math.min(width, height) * 0.8)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size === 0) return;
    const manager = nipplejs.create({
      zone: zone.current!,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      size,
      restOpacity: 1,
      fadeTime: 0,
      color: { front: '#0b5cad', back: '#c9c5ba' },
    });
    manager.on('move', ({ data: { vector } }) => {
      const inDeadZone = Math.hypot(vector.x, vector.y) < DEAD_ZONE;
      onChange(inDeadZone ? 0 : vector.x * 100, inDeadZone ? 0 : vector.y * 100);
    });
    manager.on('end', () => onChange(0, 0));
    return () => manager.destroy();
  }, [size, onChange]);

  return <div ref={zone} data-testid="joystick" className="relative size-full" />;
}
