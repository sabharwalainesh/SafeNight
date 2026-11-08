import { useContext } from 'react';
import { ProfileContext } from '../features/profile/api';

/** Photo for a user if I may see it (me + current group); undefined outside a ProfileContext. */
export function usePhoto(userId: string | undefined): string | undefined {
  const api = useContext(ProfileContext);
  return userId ? api?.photos?.[userId] : undefined;
}

/** Circular avatar: profile photo, else emoji, else first initial. Decorative (aria-hidden); label the row instead. */
export function Avatar({
  userId,
  name,
  emoji,
  photo,
  size = 36,
  color,
}: {
  userId?: string;
  name: string;
  emoji?: string;
  photo?: string;
  size?: number;
  color?: string;
}) {
  const shared = usePhoto(userId);
  const src = photo ?? shared;
  const style = { width: size, height: size, fontSize: Math.round(size * (emoji ? 0.55 : 0.42)), ...(color ? { background: color } : {}) };
  return (
    <span className="sn-avatar" style={style} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : emoji || (name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
