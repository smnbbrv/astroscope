import type { CSSProperties, HTMLAttributes } from 'react';

export interface StyledBadgeProps {
  label: string;
  style?: CSSProperties;
  containerProps?: HTMLAttributes<HTMLDivElement>;
}

export default function StyledBadge({ label, style, containerProps }: StyledBadgeProps) {
  return (
    <div className="badge badge-primary" style={style} {...containerProps}>
      {label}
    </div>
  );
}
