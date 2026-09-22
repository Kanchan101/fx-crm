'use client';

// Clients do not live inside BD. If anything reaches this old URL,
// send the user to the main Clients tab.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BDAccountsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/clients'); }, [router]);
  return <div className="py-24 text-center text-sm text-gray-400">Taking you to Clients…</div>;
}
