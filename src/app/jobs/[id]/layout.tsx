import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const res = await fetch(`${apiUrl}/api/public/jobs/${params.id}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Not found');
    const job = await res.json();

    const title = `${job.title} at ${job.company} — ${job.location}`;
    const description = `${job.title} | ${job.company} | ${job.location} | ${job.experience} experience | Skills: ${job.skills || 'Various'} | Apply now via FX Consulting`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        siteName: 'FX Consulting — Recruitment',
        url: `https://crm.fxconsulting.in/jobs/${params.id}`,
      },
      twitter: {
        card: 'summary',
        title,
        description,
      },
    };
  } catch {
    return {
      title: 'Job Opportunity — FX Consulting',
      description: 'Apply for exciting career opportunities via FX Consulting',
    };
  }
}

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
