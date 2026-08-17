import { redirect } from 'next/navigation';

/**
 * Root route redirects directly to the main Procurement workspace.
 */
export default function Home() {
  redirect('/procurement');
}
