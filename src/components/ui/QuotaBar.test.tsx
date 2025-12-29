import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuotaBar } from './QuotaBar';

describe('QuotaBar', () => {
  it('renders label and percentage', () => {
    render(<QuotaBar label="Primary" percent={73} />);
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('73%')).toBeInTheDocument();
  });
});

