import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { usePreflight, useSignIn } from '@/api/hooks';
import {
  AuthContainer,
  AuthContent,
  AuthFooter,
  AuthHeader,
  AuthInput,
  BackButton,
  SignInPageContainer,
} from '@/components/auth';
import { Button } from '@/components/button';
import { OtherPageLayout } from '@/components/layout';

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
});

type Step = 'email' | 'password';

function SignInPage() {
  const navigate = useNavigate();
  const preflight = usePreflight();
  const signIn = useSignIn();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isValidEmail, setIsValidEmail] = useState(true);
  const [passwordError, setPasswordError] = useState(false);

  const handleContinue = async () => {
    if (!email || !email.includes('@')) {
      setIsValidEmail(false);
      return;
    }
    setIsValidEmail(true);

    try {
      const result = await preflight.mutateAsync(email);
      if (result.registered && result.hasPassword) {
        setStep('password');
      } else {
        setIsValidEmail(false);
      }
    } catch {
      setIsValidEmail(false);
    }
  };

  const handleSignIn = async () => {
    if (!password) {
      setPasswordError(true);
      return;
    }
    setPasswordError(false);

    try {
      await signIn.mutateAsync({ email, password });
      navigate({ to: '/', replace: true });
    } catch {
      setPasswordError(true);
    }
  };

  return (
    <OtherPageLayout>
      <SignInPageContainer>
        <div style={{ maxWidth: '400px', width: '100%', zIndex: 1 }}>
          {step === 'email' ? (
            <EmailStep
              email={email}
              setEmail={setEmail}
              isValidEmail={isValidEmail}
              loading={preflight.isPending}
              onContinue={handleContinue}
            />
          ) : (
            <PasswordStep
              email={email}
              password={password}
              setPassword={setPassword}
              passwordError={passwordError}
              clearError={() => setPasswordError(false)}
              loading={signIn.isPending}
              onSignIn={handleSignIn}
              onBack={() => {
                setStep('email');
                setPassword('');
                setPasswordError(false);
              }}
            />
          )}
        </div>
      </SignInPageContainer>
    </OtherPageLayout>
  );
}

function EmailStep({
  email,
  setEmail,
  isValidEmail,
  loading,
  onContinue,
}: {
  email: string;
  setEmail: (v: string) => void;
  isValidEmail: boolean;
  loading: boolean;
  onContinue: () => void;
}) {
  return (
    <AuthContainer>
      <AuthHeader title="Sign in" subTitle="madoc" />
      <AuthContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onContinue();
          }}
        >
          <AuthInput
            label="Email"
            placeholder="Enter your email"
            onChange={setEmail}
            value={email}
            error={!isValidEmail}
            errorHint={isValidEmail ? '' : 'Invalid email address.'}
            onEnter={onContinue}
            type="email"
            name="username"
            autoComplete="username"
            autoFocus
          />
          <Button
            type="submit"
            size="extraLarge"
            block
            loading={loading}
            disabled={loading}
            data-testid="continue-login-button"
          >
            Continue
          </Button>
        </form>
      </AuthContent>
    </AuthContainer>
  );
}

function PasswordStep({
  email,
  password,
  setPassword,
  passwordError,
  clearError,
  loading,
  onSignIn,
  onBack,
}: {
  email: string;
  password: string;
  setPassword: (v: string) => void;
  passwordError: boolean;
  clearError: () => void;
  loading: boolean;
  onSignIn: () => void;
  onBack: () => void;
}) {
  return (
    <AuthContainer>
      <AuthHeader title="Sign in" subTitle="madoc" />
      <AuthContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSignIn();
          }}
        >
          <AuthInput
            label="Email"
            value={email}
            readOnly={true}
            type="email"
            name="username"
            autoComplete="username"
          />
          <AuthInput
            label="Password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              if (passwordError) clearError();
            }}
            type="password"
            name="password"
            autoComplete="current-password"
            error={passwordError}
            errorHint={passwordError ? 'Invalid email or password.' : ''}
            onEnter={onSignIn}
            autoFocus
            data-testid="password-input"
          />
          <Button
            type="submit"
            size="extraLarge"
            block
            loading={loading}
            disabled={loading}
            data-testid="sign-in-button"
          >
            Sign In
          </Button>
        </form>
      </AuthContent>
      <AuthFooter>
        <BackButton onClick={onBack} />
      </AuthFooter>
    </AuthContainer>
  );
}
