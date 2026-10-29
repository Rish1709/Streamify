import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination.jsx';

const meta = (page, totalPages) => ({
  page,
  totalPages,
  limit: 10,
  total: totalPages * 10,
  hasPrev: page > 1,
  hasNext: page < totalPages,
});

describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination pagination={meta(1, 1)} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('disables Previous on the first page and moves forward', async () => {
    const onChange = vi.fn();
    render(<Pagination pagination={meta(1, 3)} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('disables Next on the last page', () => {
    render(<Pagination pagination={meta(3, 3)} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
