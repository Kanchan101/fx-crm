'use client';

import { useState } from 'react';
import {
  X, Copy, Check, ExternalLink, Linkedin, MessageSquare, Mail, Globe, FileText,
} from 'lucide-react';
import clsx from 'clsx';

interface ShareJDProps {
  show: boolean;
  onClose: () => void;
  job: {
    id: string;
    title: string;
    client_name: string;
    location: string;
    exp_min: number;
    exp_max: number;
    ctc_min: number;
    ctc_max: number;
    skills: string;
    description: string;
    type: string;
    positions_count: number;
    client_industry: string;
  };
}

export default function ShareJD({ show, onClose, job }: ShareJDProps) {
  const [copied, setCopied] = useState('');

  if (!show) return null;

  const publicUrl = `https://crm.fxconsulting.in/jobs/${job.id}`;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  // LinkedIn post text
  const linkedinPost = `🚀 We're Hiring: ${job.title}

📍 ${job.location} | ${job.type}
🏢 ${job.client_name}${job.client_industry ? ` (${job.client_industry})` : ''}
📅 Experience: ${job.exp_min}-${job.exp_max} years
${job.positions_count > 1 ? `👥 ${job.positions_count} positions\n` : ''}
${job.skills ? `🔧 Skills: ${job.skills}\n` : ''}
${job.description ? job.description.substring(0, 500) + (job.description.length > 500 ? '...' : '') : ''}

Interested? Apply here: ${publicUrl}

#hiring #${job.title.replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '')} #jobs #recruitment #${job.location?.replace(/\s+/g, '') || 'India'}`;

  const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`;

  // WhatsApp text
  const whatsappText = `*${job.title}*
Company: ${job.client_name}
Location: ${job.location}
Experience: ${job.exp_min}-${job.exp_max} years
Type: ${job.type}
${job.skills ? `\nSkills: ${job.skills}` : ''}
${job.description ? `\n${job.description.substring(0, 600)}` : ''}

Apply: ${publicUrl}

_Shared by FX Consulting_`;

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  // Job board formatted text (for IIMJobs, Hirist, Naukri etc)
  const jobBoardText = `Job Title: ${job.title}
Company: ${job.client_name}
Location: ${job.location}
Job Type: ${job.type}
Experience: ${job.exp_min}-${job.exp_max} years
No. of Positions: ${job.positions_count}

Skills Required:
${job.skills || 'Not specified'}

Job Description:
${job.description || 'Not specified'}

How to Apply:
Send your CV to careers@fxconsulting.in with subject "${job.title} Application"

About the Recruiter:
FX Consulting — Recruitment Consulting Firm
Website: fxconsulting.in`;

  // Email share
  const emailSubject = encodeURIComponent(`Job Opportunity: ${job.title} at ${job.client_name}`);
  const emailBody = encodeURIComponent(`Hi,\n\nCheck out this job opportunity:\n\n${job.title} at ${job.client_name}\nLocation: ${job.location}\nExperience: ${job.exp_min}-${job.exp_max} years\n\nView full JD: ${publicUrl}\n\nRegards,\nFX Consulting`);

  const platforms = [
    {
      id: 'linkedin-post',
      name: 'LinkedIn Post',
      icon: Linkedin,
      color: 'bg-[#0077B5] hover:bg-[#006699]',
      action: () => copyText(linkedinPost, 'linkedin-post'),
      label: 'Copy Post',
      description: 'Copy formatted post → paste on LinkedIn',
    },
    {
      id: 'linkedin-share',
      name: 'LinkedIn Share',
      icon: ExternalLink,
      color: 'bg-[#0077B5] hover:bg-[#006699]',
      action: () => window.open(linkedinShareUrl, '_blank'),
      label: 'Open LinkedIn',
      description: 'Share JD link directly on LinkedIn',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: MessageSquare,
      color: 'bg-[#25D366] hover:bg-[#1da851]',
      action: () => window.open(whatsappShareUrl, '_blank'),
      label: 'Share',
      description: 'Send JD to WhatsApp group/contact',
    },
    {
      id: 'iimjobs',
      name: 'IIMJobs / Hirist / Naukri',
      icon: Globe,
      color: 'bg-orange-500 hover:bg-orange-600',
      action: () => copyText(jobBoardText, 'jobboard'),
      label: 'Copy JD',
      description: 'Copy formatted JD → paste on any job board',
    },
    {
      id: 'email',
      name: 'Email',
      icon: Mail,
      color: 'bg-gray-600 hover:bg-gray-700',
      action: () => window.open(`mailto:?subject=${emailSubject}&body=${emailBody}`, '_blank'),
      label: 'Compose Email',
      description: 'Open email client with JD details',
    },
    {
      id: 'link',
      name: 'Public Link',
      icon: Copy,
      color: 'bg-fx-600 hover:bg-fx-700',
      action: () => copyText(publicUrl, 'link'),
      label: 'Copy Link',
      description: publicUrl,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Share JD</h2>
            <p className="text-xs text-gray-400 mt-0.5">{job.title} — {job.client_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {platforms.map((p) => {
            const Icon = p.icon;
            const isCopied = copied === p.id || (p.id === 'iimjobs' && copied === 'jobboard');
            return (
              <div key={p.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0', p.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{p.description}</p>
                </div>
                <button onClick={p.action}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0',
                    isCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}>
                  {isCopied ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Copied</span> : p.label}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-5">
          <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <strong>Tip:</strong> For IIMJobs, Hirist, Naukri — click "Copy JD" then paste into their job posting form. The public link works as the apply URL.
          </div>
        </div>
      </div>
    </div>
  );
}
