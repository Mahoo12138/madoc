import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { useCreateAdmin } from '@/api/hooks';
import {
  AuthContainer,
  AuthContent,
  AuthHeader,
  AuthInput,
  SignInPageContainer,
} from '@/components/auth';
import { Button } from '@/components/button';
import { OtherPageLayout } from '@/components/layout';

export const Route = createFileRoute('/setup')({
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const createAdmin = useCreateAdmin();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invalidEmail, setInvalidEmail] = useState(false);
  const [invalidPassword, setInvalidPassword] = useState(false);

  const handleSubmit = async () => {
    setInvalidEmail(false);
    setInvalidPassword(false);

    if (!email || !email.includes('@')) {
      setInvalidEmail(true);
      return;
    }
    if (!password || password.length < 8) {
      setInvalidPassword(true);
      return;
    }

    try {
      await createAdmin.mutateAsync({ name, email, password });
      navigate({ to: '/', replace: true });
    } catch {
      // error shown via mutation error state
    }
  };

  return (
    <OtherPageLayout>
      <SignInPageContainer>
        <div style={{ maxWidth: '400px', width: '100%', zIndex: 1 }}>
          <AuthContainer>
            <AuthHeader
              title="Welcome to madoc"
              subTitle="Create the administrator account to get started."
            />
            <AuthContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
              >
                <AuthInput
                  label="Name"
                  value={name}
                  onChange={setName}
                  placeholder="Admin"
                  onEnter={handleSubmit}
                />
                <AuthInput
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="admin@example.com"
                  error={invalidEmail}
                  errorHint={invalidEmail ? 'Invalid email address.' : ''}
                  onEnter={handleSubmit}
                  type="email"
                  name="username"
                  autoComplete="username"
                />
                <AuthInput
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="At least 8 characters"
                  error={invalidPassword}
                  errorHint={
                    invalidPassword
                      ? 'Password must be at least 8 characters.'
                      : ''
                  }
                  onEnter={handleSubmit}
                  name="new-password"
                  autoComplete="new-password"
                />
                <Button
                  type="submit"
                  size="extraLarge"
                  block
                  loading={createAdmin.isPending}
                  disabled={!email || !password}
                >
                  Create Admin Account
                </Button>
              </form>
            </AuthContent>
          </AuthContainer>
        </div>
      </SignInPageContainer>
    </OtherPageLayout>
  );
}
