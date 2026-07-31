import { redirect } from 'next/navigation';

/**
 * The application's landing page is the login screen.
 *
 * Unauthenticated visitors stay on /login. Visitors who already hold a Supabase
 * session are forwarded from /login to the landing page for their role by
 * LayoutWrapper (see getRoleLandingPath in lib/rbac).
 */
export default function Home() {
  redirect('/login');
}
