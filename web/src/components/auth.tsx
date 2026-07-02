import type { ReactNode } from 'react';

import {
  authContainer,
  authContent,
  authFooter,
  authHeaderWrapper,
  authInputError,
  authInputWrapper,
  backButton,
  signInPageContainer,
} from '@/styles/theme.css';

export function AuthContainer({ children }: { children: ReactNode }) {
  return <div className={authContainer}>{children}</div>;
}

export function AuthHeader({
  title,
  subTitle,
}: {
  title: string;
  subTitle?: string;
}) {
  return (
    <div className={authHeaderWrapper}>
      <p>
        <MadocLogo />
        {title}
      </p>
      {subTitle && <p>{subTitle}</p>}
    </div>
  );
}

export function AuthContent({ children }: { children: ReactNode }) {
  return <div className={authContent}>{children}</div>;
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <div className={authFooter}>{children}</div>;
}

export function SignInPageContainer({ children }: { children: ReactNode }) {
  return <div className={signInPageContainer}>{children}</div>;
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className={backButton} onClick={onClick}>
      ← Back
    </button>
  );
}

interface AuthInputProps {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: boolean;
  errorHint?: ReactNode;
  onEnter?: () => void;
  readOnly?: boolean;
  autoFocus?: boolean;
  name?: string;
  autoComplete?: string;
  'data-testid'?: string;
}

export function AuthInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error = false,
  errorHint,
  onEnter,
  readOnly,
  autoFocus,
  name,
  autoComplete,
  'data-testid': dataTestId,
}: AuthInputProps) {
  return (
    <div className={`${authInputWrapper} ${errorHint ? 'with-hint' : ''}`}>
      {label && <label>{label}</label>}
      <div
        className={`input-wrapper ${error ? 'error' : 'default'} extra-large`}
        style={{
          width: '100%',
          height: '40px',
          lineHeight: '22px',
          gap: '10px',
          color: '#2b2b2b',
          border: '1px solid',
          borderColor: error ? '#e68080' : 'rgba(0,0,0,0.1)',
          backgroundColor: '#fff',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '14px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <input
          style={{
            height: '100%',
            width: '0',
            flex: 1,
            boxSizing: 'border-box',
            padding: '0 12px',
            WebkitAppearance: 'none',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none',
            border: 'none',
            background: 'transparent',
            fontWeight: 600,
          }}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter?.();
          }}
          readOnly={readOnly}
          autoFocus={autoFocus}
          name={name}
          autoComplete={autoComplete}
          data-testid={dataTestId}
        />
      </div>
      <div
        className={authInputError}
        style={{ visibility: error ? 'visible' : 'hidden' }}
      >
        {errorHint}
      </div>
    </div>
  );
}

function MadocLogo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.5 3H15L12.5 10L10 3H7.5L5 10L2.5 3H0L5 17H7.5L10 10L12.5 17H15L17.5 3Z" fill="currentColor" />
    </svg>
  );
}
