import type React from 'react';

export const Guard = (props: {
  permission: string;
  children: (can: boolean | undefined) => React.ReactNode;
}) => {
  const { children } = props;
  if (typeof children === 'function') {
    return children(true);
  }
  throw new Error('children must be a function');
};
