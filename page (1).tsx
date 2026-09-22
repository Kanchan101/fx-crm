'use client';

// Client detail lives in the main Clients tab, not in BD.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BDAccountDetailRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/clients'); }, [router]);
  return <div className="py-24 text-center text-sm text-gray-400">Taking you to Clients…</div>;
}
