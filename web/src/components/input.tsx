import { forwardRef, type KeyboardEventHandler } from 'react';

import { input, inputWrapper } from '@/styles/theme.css';

export type InputProps = {
  disabled?: boolean;
  onChange?: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  status?: 'error' | 'success' | 'warning' | 'default';
  size?: 'default' | 'large' | 'extraLarge';
  type?: string;
  onEnter?: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'onBlur'>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    disabled,
    onChange,
    status = 'default',
    size = 'default',
    onEnter,
    ...otherProps
  },
  ref,
) {
  return (
    <div
      className={`${inputWrapper} ${status} ${size}`}
    >
      <input
        ref={ref}
        className={input}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
        {...otherProps}
      />
    </div>
  );
});
