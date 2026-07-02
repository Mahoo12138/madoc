import type { ButtonHTMLAttributes, ReactNode } from 'react';

import {
  buttonBase,
  buttonExtraLarge,
  buttonPrimary,
} from '@/styles/theme.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary';
  size?: 'extraLarge';
  block?: boolean;
  loading?: boolean;
  suffix?: ReactNode;
}

export function Button({
  variant = 'primary',
  size,
  block,
  loading,
  suffix,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    buttonBase,
    variant === 'primary' ? buttonPrimary : '',
    size === 'extraLarge' ? buttonExtraLarge : '',
    className ?? '',
  ].join(' ');

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      style={block ? { width: '100%' } : undefined}
      {...rest}
    >
      {loading ? 'Loading...' : children}
      {suffix}
    </button>
  );
}
