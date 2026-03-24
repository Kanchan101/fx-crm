import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════
// FX CONSULTING — RECRUITMENT CRM
// Inspired by Greenhouse (structured pipelines, scorecards, prospect pools)
// + Workday (unified hub, AI matching, candidate engagement, analytics)
// Built for 10,000 CV/week agency throughput
// ═══════════════════════════════════════════════════════════════════════

// ── DATA LAYER ─────────────────────────────────────────────────────────
const CLIENTS = [
  { id: "C001", name: "Infosys BPM", industry: "IT Services", poc: "Rajesh Mehta", pocRole: "TA Head", email: "rajesh.m@infosys.com", phone: "+91 98765 43210", location: "Bangalore", status: "Active", tier: "Platinum", openReqs: 8, totalPlacements: 42, revenue: 6300000, lastContact: "2026-03-22", contractEnd: "2027-03-31", paymentTerms: "Net 30", feePercent: 8.33 },
  { id: "C002", name: "Wipro Technologies", industry: "IT Services", poc: "Anita Sharma", pocRole: "HR Director", email: "anita.s@wipro.com", phone: "+91 98123 45678", location: "Pune", status: "Active", tier: "Gold", openReqs: 5, totalPlacements: 28, revenue: 4200000, lastContact: "2026-03-20", contractEnd: "2026-12-31", paymentTerms: "Net 45", feePercent: 8.33 },
  { id: "C003", name: "Tata Motors", industry: "Automotive", poc: "Vikram Singh", pocRole: "VP HR", email: "vikram.s@tatamotors.com", phone: "+91 99887 65432", location: "Mumbai", status: "Active", tier: "Gold", openReqs: 4, totalPlacements: 18, revenue: 2700000, lastContact: "2026-03-18", contractEnd: "2026-09-30", paymentTerms: "Net 30", feePercent: 10 },
  { id: "C004", name: "HCL Technologies", industry: "IT Services", poc: "Priya Nair", pocRole: "Recruitment Lead", email: "priya.n@hcl.com", phone: "+91 97654 32100", location: "Noida", status: "Active", tier: "Platinum", openReqs: 12, totalPlacements: 55, revenue: 8250000, lastContact: "2026-03-23", contractEnd: "2027-06-30", paymentTerms: "Net 30", feePercent: 8.33 },
  { id: "C005", name: "Reliance Jio", industry: "Telecom", poc: "Arjun Patel", pocRole: "Sr. HRBP", email: "arjun.p@jio.com", phone: "+91 96543 21098", location: "Mumbai", status: "Dormant", tier: "Silver", openReqs: 0, totalPlacements: 8, revenue: 1200000, lastContact: "2026-01-15", contractEnd: "2026-06-30", paymentTerms: "Net 60", feePercent: 8.33 },
  { id: "C006", name: "Tech Mahindra", industry: "IT Services", poc: "Sunita Reddy", pocRole: "TA Manager", email: "sunita.r@techmahindra.com", phone: "+91 94321 09876", location: "Hyderabad", status: "Active", tier: "Gold", openReqs: 6, totalPlacements: 22, revenue: 3300000, lastContact: "2026-03-21", contractEnd: "2027-01-31", paymentTerms: "Net 30", feePercent: 8.33 },
  { id: "C007", name: "Bajaj Finance", industry: "BFSI", poc: "Manoj Gupta", pocRole: "CHRO", email: "manoj.g@bajajfinance.com", phone: "+91 93210 98765", location: "Pune", status: "Active", tier: "Silver", openReqs: 3, totalPlacements: 14, revenue: 2100000, lastContact: "2026-03-19", contractEnd: "2026-12-31", paymentTerms: "Net 45", feePercent: 10 },
  { id: "C008", name: "L&T Infotech", industry: "IT Services", poc: "Kavitha Mohan", pocRole: "AVP Talent", email: "kavitha.m@ltimindtree.com", phone: "+91 92109 87654", location: "Mumbai", status: "Active", tier: "Gold", openReqs: 7, totalPlacements: 30, revenue: 4500000, lastContact: "2026-03-22", contractEnd: "2027-03-31", paymentTerms: "Net 30", feePercent: 8.33 },
  { id: "C009", name: "Mahindra & Mahindra", industry: "Automotive", poc: "Deepak Kulkarni", pocRole: "Group HR", email: "deepak.k@mahindra.com", phone: "+91 95432 10987", location: "Mumbai", status: "Active", tier: "Silver", openReqs: 2, totalPlacements: 10, revenue: 1500000, lastContact: "2026-03-17", contractEnd: "2026-09-30", paymentTerms: "Net 30", feePercent: 10 },
  { id: "C010", name: "HDFC Bank", industry: "BFSI", poc: "Ramesh Iyer", pocRole: "Head Recruitment", email: "ramesh.i@hdfcbank.com", phone: "+91 91098 76543", location: "Mumbai", status: "Active", tier: "Platinum", openReqs: 10, totalPlacements: 48, revenue: 7200000, lastContact: "2026-03-23", contractEnd: "2027-06-30", paymentTerms: "Net 30", feePercent: 8.33 },
];

const genCandidates = () => {
  const names = ["Amit Kumar","Sneha Iyer","Rahul Verma","Priyanka Das","Karthik Rajan","Neha Gupta","Siddharth Joshi","Meera Nair","Arjun Menon","Divya Sharma","Rohit Tiwari","Anjali Mishra","Varun Kapoor","Pooja Reddy","Manish Saxena","Ritu Agarwal","Sandeep Yadav","Swati Deshmukh","Nitin Patil","Kavya Srinivasan","Abhinav Chandra","Shreya Banerjee","Gaurav Mehta","Pallavi Jain","Aditya Narayan","Nisha Pillai","Rajat Khanna","Deepika Venkat","Suresh Babu","Tanvi Kulkarni"];
  const roles = ["Java Developer","Data Scientist","DevOps Engineer","Full Stack Developer","SAP Consultant","Product Manager","Cloud Architect","QA Lead","React Developer","HR Manager","Python Developer","ML Engineer","Scrum Master","Business Analyst","UX Designer","iOS Developer","Android Developer","Data Engineer","SRE","Cybersecurity Analyst"];
  const skills = [["Java","Spring Boot","AWS"],["Python","ML","TensorFlow"],["Docker","K8s","Jenkins"],["React","Node.js","MongoDB"],["SAP FICO","S/4HANA","ABAP"],["Agile","Jira","SQL"],["AWS","Azure","Terraform"],["Selenium","Cypress","CI/CD"],["React","TypeScript","GraphQL"],["HRIS","L&D","Compliance"],["Python","Django","PostgreSQL"],["PyTorch","NLP","MLOps"],["Agile","Kanban","Confluence"],["Tableau","Power BI","SQL"],["Figma","Adobe XD","CSS"],["Swift","Xcode","Firebase"],["Kotlin","Jetpack","Firebase"],["Spark","Airflow","Snowflake"],["Linux","Prometheus","Grafana"],["SIEM","Pen Testing","IAM"]];
  const locs = ["Bangalore","Pune","Mumbai","Hyderabad","Noida","Chennai","Gurgaon","Kochi","Kolkata","Ahmedabad"];
  const sources = ["LinkedIn","Naukri","Referral","Indeed","Monster","Direct","Campus","Job Fair"];
  const statuses = ["Active","In Pipeline","Offered","Placed","On Hold","Rejected"];
  return names.map((n, i) => ({
    id: `CN${String(i+1).padStart(4,"0")}`, name: n, role: roles[i % roles.length], experience: `${2 + (i % 12)} yrs`,
    skills: skills[i % skills.length], location: locs[i % locs.length], status: statuses[i % statuses.length],
    email: `${n.split(" ")[0].toLowerCase()}.${n.split(" ")[1]?.[0]?.toLowerCase() || "x"}@gmail.com`,
    phone: `+91 ${80000 + i * 1111} ${10000 + i * 333}`, currentCTC: `${6 + i * 2} LPA`, expectedCTC: `${10 + i * 2.5} LPA`,
    noticePeriod: ["Immediate","15 days","30 days","60 days","90 days"][i % 5], source: sources[i % sources.length],
    resumeScore: 55 + (i * 3) % 45, lastActive: `2026-03-${String(10 + i % 15).padStart(2,"0")}`,
    whatsapp: i % 3 === 0 ? "Opted In" : i % 3 === 1 ? "Opted In" : "Not Opted",
    naukriId: i % 2 === 0 ? `NK${100000 + i}` : null, linkedinUrl: i % 3 !== 2 ? `linkedin.com/in/${n.split(" ").join("-").toLowerCase()}` : null,
  }));
};

const CANDIDATES = genCandidates();

const JOBS = [
  { id: "JB001", title: "Senior Java Developer", client: "Infosys BPM", clientId: "C001", location: "Bangalore", type: "Permanent", ctcRange: "18–25 LPA", positions: 4, filled: 1, submitted: 12, shortlisted: 5, status: "Open", priority: "Critical", postedDate: "2026-02-15", deadline: "2026-04-15", skills: ["Java","Spring Boot","Microservices"], recruiter: "Kavita" },
  { id: "JB002", title: "Data Scientist", client: "Wipro Technologies", clientId: "C002", location: "Pune", type: "Permanent", ctcRange: "20–30 LPA", positions: 2, filled: 0, submitted: 8, shortlisted: 3, status: "Open", priority: "Critical", postedDate: "2026-03-01", deadline: "2026-04-01", skills: ["Python","ML","TensorFlow"], recruiter: "Kanchann" },
  { id: "JB003", title: "DevOps Lead", client: "HCL Technologies", clientId: "C004", location: "Noida", type: "Permanent", ctcRange: "25–35 LPA", positions: 1, filled: 1, submitted: 6, shortlisted: 2, status: "Closed", priority: "High", postedDate: "2026-01-10", deadline: "2026-03-10", skills: ["AWS","Docker","K8s"], recruiter: "Kavita" },
  { id: "JB004", title: "SAP FICO Consultant", client: "Tata Motors", clientId: "C003", location: "Mumbai", type: "Contract", ctcRange: "30–40 LPA", positions: 3, filled: 0, submitted: 10, shortlisted: 4, status: "Open", priority: "High", postedDate: "2026-03-05", deadline: "2026-05-05", skills: ["SAP FICO","S/4HANA"], recruiter: "Ritu" },
  { id: "JB005", title: "Full Stack Developer", client: "Bajaj Finance", clientId: "C007", location: "Pune", type: "Permanent", ctcRange: "14–22 LPA", positions: 5, filled: 2, submitted: 20, shortlisted: 8, status: "Open", priority: "High", postedDate: "2026-02-28", deadline: "2026-04-28", skills: ["React","Node.js","MongoDB"], recruiter: "Priya" },
  { id: "JB006", title: "Cloud Architect", client: "Tech Mahindra", clientId: "C006", location: "Hyderabad", type: "Permanent", ctcRange: "35–50 LPA", positions: 1, filled: 1, submitted: 4, shortlisted: 2, status: "Closed", priority: "Critical", postedDate: "2026-01-20", deadline: "2026-03-20", skills: ["AWS","Azure","GCP"], recruiter: "Kanchann" },
  { id: "JB007", title: "Product Manager", client: "HCL Technologies", clientId: "C004", location: "Noida", type: "Permanent", ctcRange: "25–35 LPA", positions: 3, filled: 0, submitted: 14, shortlisted: 6, status: "Open", priority: "High", postedDate: "2026-03-12", deadline: "2026-04-30", skills: ["Agile","Data Analytics","B2B SaaS"], recruiter: "Kavita" },
  { id: "JB008", title: "QA Automation Lead", client: "L&T Infotech", clientId: "C008", location: "Mumbai", type: "Permanent", ctcRange: "18–25 LPA", positions: 2, filled: 0, submitted: 9, shortlisted: 3, status: "Open", priority: "Medium", postedDate: "2026-03-15", deadline: "2026-05-15", skills: ["Selenium","Cypress","CI/CD"], recruiter: "Ritu" },
  { id: "JB009", title: "React Developer", client: "HDFC Bank", clientId: "C010", location: "Mumbai", type: "Permanent", ctcRange: "14–20 LPA", positions: 6, filled: 1, submitted: 25, shortlisted: 10, status: "Open", priority: "Critical", postedDate: "2026-03-01", deadline: "2026-04-15", skills: ["React","TypeScript","Node.js"], recruiter: "Priya" },
  { id: "JB010", title: "ML Engineer", client: "Infosys BPM", clientId: "C001", location: "Bangalore", type: "Permanent", ctcRange: "22–32 LPA", positions: 2, filled: 0, submitted: 7, shortlisted: 2, status: "Open", priority: "High", postedDate: "2026-03-18", deadline: "2026-05-18", skills: ["PyTorch","NLP","MLOps"], recruiter: "Kanchann" },
];

const PIPELINE_STAGES = ["Sourced","Screening","Submitted to Client","Client Interview","Technical Round","HR Round","Offer Negotiation","Offer Accepted","Joined"];
const STAGE_CLR = {"Sourced":"#64748B","Screening":"#3B82F6","Submitted to Client":"#6366F1","Client Interview":"#8B5CF6","Technical Round":"#F59E0B","HR Round":"#EC4899","Offer Negotiation":"#14B8A6","Offer Accepted":"#10B981","Joined":"#059669"};

const PIPELINE = [
  { id: 1, candidateId: "CN0001", candidate: "Amit Kumar", jobId: "JB001", job: "Senior Java Developer", client: "Infosys BPM", stage: "Technical Round", recruiter: "Kavita", updated: "2026-03-22", score: 82, notes: "Strong Spring Boot, client liked profile", interviewDate: "2026-03-25 10:00" },
  { id: 2, candidateId: "CN0002", candidate: "Sneha Iyer", jobId: "JB002", job: "Data Scientist", client: "Wipro Technologies", stage: "Screening", recruiter: "Kanchann", updated: "2026-03-23", score: 74, notes: "Good ML background, needs TF assessment" },
  { id: 3, candidateId: "CN0003", candidate: "Rahul Verma", jobId: "JB003", job: "DevOps Lead", client: "HCL Technologies", stage: "Joined", recruiter: "Kavita", updated: "2026-03-15", score: 91, notes: "Joined March 15, confirmed" },
  { id: 4, candidateId: "CN0005", candidate: "Karthik Rajan", jobId: "JB004", job: "SAP FICO Consultant", client: "Tata Motors", stage: "Client Interview", recruiter: "Ritu", updated: "2026-03-21", score: 78, notes: "Interview March 25", interviewDate: "2026-03-25 14:00" },
  { id: 5, candidateId: "CN0004", candidate: "Priyanka Das", jobId: "JB005", job: "Full Stack Developer", client: "Bajaj Finance", stage: "Submitted to Client", recruiter: "Priya", updated: "2026-03-24", score: 70, notes: "Profile shared, awaiting feedback" },
  { id: 6, candidateId: "CN0006", candidate: "Neha Gupta", jobId: "JB007", job: "Product Manager", client: "HCL Technologies", stage: "Offer Negotiation", recruiter: "Kavita", updated: "2026-03-23", score: 85, notes: "HR cleared, offer 28 LPA" },
  { id: 7, candidateId: "CN0007", candidate: "Siddharth Joshi", jobId: "JB006", job: "Cloud Architect", client: "Tech Mahindra", stage: "Joined", recruiter: "Kanchann", updated: "2026-03-01", score: 95, notes: "Joined March 1" },
  { id: 8, candidateId: "CN0010", candidate: "Divya Sharma", jobId: "JB008", job: "QA Automation Lead", client: "L&T Infotech", stage: "Technical Round", recruiter: "Ritu", updated: "2026-03-22", score: 72, notes: "Tech assessment in progress" },
  { id: 9, candidateId: "CN0009", candidate: "Arjun Menon", jobId: "JB009", job: "React Developer", client: "HDFC Bank", stage: "Screening", recruiter: "Priya", updated: "2026-03-23", score: 68, notes: "Resume shortlisted" },
  { id: 10, candidateId: "CN0008", candidate: "Meera Nair", jobId: "JB009", job: "React Developer", client: "HDFC Bank", stage: "Sourced", recruiter: "Priya", updated: "2026-03-24", score: 55, notes: "Profile identified" },
  { id: 11, candidateId: "CN0011", candidate: "Rohit Tiwari", jobId: "JB010", job: "ML Engineer", client: "Infosys BPM", stage: "Submitted to Client", recruiter: "Kanchann", updated: "2026-03-22", score: 76, notes: "Strong PyTorch skills" },
  { id: 12, candidateId: "CN0012", candidate: "Anjali Mishra", jobId: "JB001", job: "Senior Java Developer", client: "Infosys BPM", stage: "HR Round", recruiter: "Kavita", updated: "2026-03-21", score: 80, notes: "Cleared tech, HR scheduled" },
  { id: 13, candidateId: "CN0015", candidate: "Manish Saxena", jobId: "JB004", job: "SAP FICO Consultant", client: "Tata Motors", stage: "Sourced", recruiter: "Ritu", updated: "2026-03-24", score: 62, notes: "8 yrs SAP exp" },
  { id: 14, candidateId: "CN0014", candidate: "Pooja Reddy", jobId: "JB002", job: "Data Scientist", client: "Wipro Technologies", stage: "Submitted to Client", recruiter: "Kanchann", updated: "2026-03-20", score: 71, notes: "Profile shared with Anita" },
  { id: 15, candidateId: "CN0020", candidate: "Kavya Srinivasan", jobId: "JB009", job: "React Developer", client: "HDFC Bank", stage: "Client Interview", recruiter: "Priya", updated: "2026-03-23", score: 77, notes: "Interview went well" },
];

const TEAM = [
  { id: 1, name: "Kanchann", role: "Co-Founder", avatar: "K", color: "#3B82F6", activePipeline: 18, placements: 24, submissions: 85, cvsProcessed: 2800, revenue: 3600000, target: 5000000, efficiency: 88 },
  { id: 2, name: "Kavita", role: "Co-Founder", avatar: "Ka", color: "#8B5CF6", activePipeline: 22, placements: 20, submissions: 78, cvsProcessed: 3200, revenue: 3000000, target: 5000000, efficiency: 84 },
  { id: 3, name: "Ritu", role: "Sr. Recruiter", avatar: "R", color: "#EC4899", activePipeline: 14, placements: 10, submissions: 52, cvsProcessed: 1800, revenue: 1500000, target: 2500000, efficiency: 76 },
  { id: 4, name: "Priya", role: "Recruiter", avatar: "P", color: "#F59E0B", activePipeline: 12, placements: 6, submissions: 35, cvsProcessed: 1400, revenue: 900000, target: 2000000, efficiency: 72 },
  { id: 5, name: "Ankit", role: "Jr. Recruiter", avatar: "A", color: "#14B8A6", activePipeline: 8, placements: 3, submissions: 22, cvsProcessed: 800, revenue: 450000, target: 1000000, efficiency: 65 },
];

const INTERVIEWS = [
  { id: 1, candidate: "Amit Kumar", job: "Sr. Java Developer", client: "Infosys BPM", date: "2026-03-25", time: "10:00 AM", type: "Technical", mode: "Google Meet", link: "meet.google.com/fx-java-001", interviewer: "Rajesh Mehta", status: "Scheduled", recruiter: "Kavita" },
  { id: 2, candidate: "Karthik Rajan", job: "SAP FICO Consultant", client: "Tata Motors", date: "2026-03-25", time: "02:00 PM", type: "Client", mode: "Google Meet", link: "meet.google.com/fx-sap-004", interviewer: "Vikram Singh", status: "Scheduled", recruiter: "Ritu" },
  { id: 3, candidate: "Kavya Srinivasan", job: "React Developer", client: "HDFC Bank", date: "2026-03-26", time: "11:00 AM", type: "Technical", mode: "Google Meet", link: "meet.google.com/fx-react-009", interviewer: "Panel", status: "Scheduled", recruiter: "Priya" },
  { id: 4, candidate: "Neha Gupta", job: "Product Manager", client: "HCL Technologies", date: "2026-03-24", time: "03:00 PM", type: "HR", mode: "Google Meet", link: "meet.google.com/fx-pm-007", interviewer: "Priya Nair", status: "Completed", recruiter: "Kavita" },
  { id: 5, candidate: "Divya Sharma", job: "QA Automation Lead", client: "L&T Infotech", date: "2026-03-26", time: "10:30 AM", type: "Technical", mode: "Google Meet", link: "meet.google.com/fx-qa-008", interviewer: "Tech Panel", status: "Scheduled", recruiter: "Ritu" },
  { id: 6, candidate: "Rohit Tiwari", job: "ML Engineer", client: "Infosys BPM", date: "2026-03-27", time: "04:00 PM", type: "Client", mode: "In-Person", link: null, interviewer: "ML Lead", status: "Pending Confirmation", recruiter: "Kanchann" },
];

const WHATSAPP_THREADS = [
  { id: 1, candidate: "Amit Kumar", phone: "+91 80000 10000", lastMsg: "Hi Amit, your technical round with Infosys is confirmed for March 25 at 10 AM. Google Meet link: meet.google.com/fx-java-001. Best of luck! 🎯", time: "10:32 AM", unread: 0, status: "read" },
  { id: 2, candidate: "Karthik Rajan", phone: "+91 80004 11332", lastMsg: "Thanks, I'll be there on time.", time: "9:15 AM", unread: 0, status: "read" },
  { id: 3, candidate: "Sneha Iyer", phone: "+91 80001 10333", lastMsg: "Could you share the JD for the Data Scientist role?", time: "Yesterday", unread: 1, status: "delivered" },
  { id: 4, candidate: "Neha Gupta", phone: "+91 80005 11665", lastMsg: "Congratulations Neha! Your offer from HCL is being prepared at 28 LPA. We'll share the letter shortly. 🎉", time: "Yesterday", unread: 0, status: "read" },
  { id: 5, candidate: "Priyanka Das", phone: "+91 80003 10999", lastMsg: "Hi Priyanka, we've submitted your profile to Bajaj Finance. Will update you within 48 hours.", time: "Mar 22", unread: 0, status: "read" },
  { id: 6, candidate: "Kavya Srinivasan", phone: "+91 80019 16270", lastMsg: "Your interview with HDFC Bank is on March 26, 11 AM via Google Meet.", time: "Mar 23", unread: 2, status: "delivered" },
];

// ── ICON SYSTEM ────────────────────────────────────────────────────────
const I = ({ d, size=18, color="currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const Icons = {
  dashboard: <I d={<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>}/>,
  cv: <I d={<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}/>,
  clients: <I d={<><path d="M3 21V5a2 2 0 012-2h6v18H3z"/><path d="M13 21V11h6a2 2 0 012 2v8h-8z"/></>}/>,
  candidates: <I d={<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>}/>,
  jobs: <I d={<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></>}/>,
  pipeline: <I d={<><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>}/>,
  interviews: <I d={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15" r="2"/></>}/>,
  whatsapp: <I d={<><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></>}/>,
  sourcing: <I d={<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></>}/>,
  team: <I d={<><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>}/>,
  reports: <I d={<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>}/>,
  search: <I d={<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}/>,
  plus: <I d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}/>,
  chevR: <I d={<><polyline points="9,18 15,12 9,6"/></>}/>,
  chevL: <I d={<><polyline points="15,18 9,12 15,6"/></>}/>,
  x: <I d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}/>,
  check: <I d={<><polyline points="20,6 9,17 4,12"/></>}/>,
  bell: <I d={<><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>}/>,
  upload: <I d={<><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></>}/>,
  video: <I d={<><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></>}/>,
  send: <I d={<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></>}/>,
  link: <I d={<><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>}/>,
  linkedin: <I d={<><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></>}/>,
  star: <I d={<><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></>}/>,
  clock: <I d={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}/>,
  filter: <I d={<><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/></>}/>,
  phone: <I d={<><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.81.36 1.6.68 2.35a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0122 16.92z"/></>}/>,
  mail: <I d={<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>}/>,
  globe: <I d={<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>}/>,
  zap: <I d={<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>}/>,
  target: <I d={<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>}/>,
  award: <I d={<><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></>}/>,
  trendUp: <I d={<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>}/>,
};

// ── STYLE CONSTANTS ────────────────────────────────────────────────────
const C = {
  bg: "#07080A", surface: "#0F1114", card: "#13161A", border: "#1E2228",
  borderHover: "#2A3040", text: "#E8ECF1", textMuted: "#7A8494",
  textDim: "#4A5568", accent: "#2563EB", accentLight: "#3B82F6",
  accentGlow: "rgba(37,99,235,0.12)", green: "#10B981", greenGlow: "rgba(16,185,129,0.12)",
  red: "#EF4444", yellow: "#F59E0B", purple: "#8B5CF6", pink: "#EC4899", teal: "#14B8A6",
  whatsapp: "#25D366",
};
const F = { body: "'Satoshi', 'General Sans', -apple-system, sans-serif", display: "'Clash Display', 'Satoshi', sans-serif" };

// ── REUSABLE COMPONENTS ────────────────────────────────────────────────
const Badge = ({ text, color = C.accent }) => (
  <span style={{ display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:20, fontSize:10.5, fontWeight:700, background:color+"16", color, letterSpacing:"0.03em", textTransform:"uppercase" }}>{text}</span>
);

const Pill = ({ text, active, onClick }) => (
  <button onClick={onClick} style={{ padding:"7px 16px", borderRadius:8, border:`1px solid ${active ? C.accent : C.border}`, background:active ? C.accentGlow : "transparent", color:active ? C.accentLight : C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F.body, transition:"all .15s" }}>{text}</button>
);

const Stat = ({ label, value, sub, color=C.accent, icon }) => (
  <div style={{ background:C.card, borderRadius:14, padding:"20px 22px", border:`1px solid ${C.border}`, flex:1, minWidth:170 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <div>
        <div style={{ fontSize:10.5, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8, fontWeight:600 }}>{label}</div>
        <div style={{ fontSize:28, fontWeight:800, color:C.text, fontFamily:F.display, letterSpacing:"-0.03em" }}>{value}</div>
        {sub && <div style={{ fontSize:11.5, color:C.textMuted, marginTop:5 }}>{sub}</div>}
      </div>
      <div style={{ width:38, height:38, borderRadius:10, background:color+"14", display:"flex", alignItems:"center", justifyContent:"center", color }}>{icon}</div>
    </div>
  </div>
);

const Bar = ({ value, max, color=C.accent, h=5 }) => (
  <div style={{ height:h, borderRadius:h/2, background:C.border, overflow:"hidden", width:"100%" }}>
    <div style={{ height:"100%", borderRadius:h/2, width:`${Math.min((value/max)*100,100)}%`, background:color, transition:"width .5s ease" }}/>
  </div>
);

const SearchBox = ({ value, onChange, placeholder="Search..." }) => (
  <div style={{ position:"relative", width:260 }}>
    <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:C.textDim }}>{Icons.search}</span>
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{ width:"100%", padding:"9px 12px 9px 36px", borderRadius:9, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:13, outline:"none", fontFamily:F.body, boxSizing:"border-box" }} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
  </div>
);

const Btn = ({ children, onClick, variant="primary", icon, small }) => {
  const styles = {
    primary: { background:C.accent, color:"#fff", border:"none" },
    secondary: { background:"transparent", color:C.textMuted, border:`1px solid ${C.border}` },
    success: { background:C.green, color:"#fff", border:"none" },
    danger: { background:C.red+"20", color:C.red, border:`1px solid ${C.red}30` },
    whatsapp: { background:C.whatsapp, color:"#fff", border:"none" },
  };
  const s = styles[variant];
  return <button onClick={onClick} style={{ ...s, display:"inline-flex", alignItems:"center", gap:6, padding:small?"6px 12px":"9px 18px", borderRadius:9, fontSize:small?11:12.5, fontWeight:600, cursor:"pointer", fontFamily:F.body, transition:"all .15s" }}>{icon}{children}</button>;
};

const Modal = ({ open, onClose, title, children, width=580 }) => {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", backdropFilter:"blur(6px)" }}/>
      <div style={{ position:"relative", background:C.card, borderRadius:18, width:`min(${width}px, 93vw)`, maxHeight:"88vh", overflow:"auto", border:`1px solid ${C.border}`, boxShadow:"0 32px 80px rgba(0,0,0,.5)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px 14px", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, background:C.card, zIndex:1, borderRadius:"18px 18px 0 0" }}>
          <h3 style={{ fontSize:16, fontWeight:700, color:C.text, fontFamily:F.display, margin:0 }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.textMuted, cursor:"pointer", padding:4 }}>{Icons.x}</button>
        </div>
        <div style={{ padding:"16px 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
};

const Field = ({ label, value }) => (
  <div style={{ marginBottom:13 }}>
    <div style={{ fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3, fontWeight:600 }}>{label}</div>
    <div style={{ fontSize:13.5, color:C.text }}>{value || "—"}</div>
  </div>
);

const Table = ({ columns, data, onRow }) => (
  <div style={{ overflowX:"auto", borderRadius:12, border:`1px solid ${C.border}` }}>
    <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:F.body }}>
      <thead><tr style={{ background:C.surface }}>{columns.map((c,i) =>
        <th key={i} style={{ padding:"11px 14px", textAlign:"left", fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700, borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" }}>{c.label}</th>
      )}</tr></thead>
      <tbody>{data.map((row,ri) =>
        <tr key={ri} onClick={()=>onRow?.(row)} style={{ cursor:onRow?"pointer":"default", borderBottom:`1px solid ${C.border}08` }} onMouseEnter={e=>e.currentTarget.style.background=C.surface} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          {columns.map((c,ci) => <td key={ci} style={{ padding:"12px 14px", fontSize:12.5, color:C.text, whiteSpace:"nowrap" }}>{c.render ? c.render(row) : row[c.key]}</td>)}
        </tr>
      )}</tbody>
    </table>
  </div>
);

const fmt = n => new Intl.NumberFormat("en-IN").format(n);
const fmtL = n => `₹${(n/100000).toFixed(1)}L`;

// ════════════════════════════════════════════════════════════════════════
// PAGE COMPONENTS
// ════════════════════════════════════════════════════════════════════════

// ── COMMAND CENTER (Dashboard) ─────────────────────────────────────────
const CommandCenter = ({ setPage }) => {
  const totalRev = CLIENTS.reduce((s,c)=>s+c.revenue,0);
  const openReqs = JOBS.filter(j=>j.status==="Open").length;
  const totalPositions = JOBS.filter(j=>j.status==="Open").reduce((s,j)=>s+j.positions-j.filled,0);
  const weekCVs = 10247;
  const todayInterviews = INTERVIEWS.filter(i=>i.date==="2026-03-25").length;

  const stageCount = PIPELINE_STAGES.map(s => ({ stage: s, count: PIPELINE.filter(p=>p.stage===s).length }));
  const revByMonth = [{l:"Oct",v:68},{l:"Nov",v:92},{l:"Dec",v:75},{l:"Jan",v:110},{l:"Feb",v:98},{l:"Mar",v:125}];
  const maxRev = Math.max(...revByMonth.map(r=>r.v));

  return <div>
    <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:24 }}>
      <Stat label="Weekly CV Throughput" value={fmt(weekCVs)} sub="↑ 12% vs last week" color={C.accent} icon={Icons.cv} />
      <Stat label="Open Positions" value={totalPositions} sub={`${openReqs} active requirements`} color={C.yellow} icon={Icons.jobs} />
      <Stat label="Active Pipeline" value={PIPELINE.length} sub={`${PIPELINE.filter(p=>p.stage==="Joined").length} joined this month`} color={C.green} icon={Icons.pipeline} />
      <Stat label="Revenue (FY26)" value={fmtL(totalRev)} sub="₹1.25Cr target" color={C.purple} icon={Icons.trendUp} />
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:20 }}>
      {/* Pipeline Funnel */}
      <div style={{ background:C.card, borderRadius:14, padding:"20px 22px", border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.06em" }}>Recruitment Funnel — Live</div>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {stageCount.map(({stage,count}) => (
            <div key={stage} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:120, fontSize:10.5, color:C.textMuted, textAlign:"right", fontWeight:500 }}>{stage}</div>
              <div style={{ flex:1, position:"relative" }}>
                <Bar value={count} max={Math.max(...stageCount.map(s=>s.count))} color={STAGE_CLR[stage]} h={18} />
                <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", fontSize:10, color:"#fff", fontWeight:700 }}>{count > 0 ? count : ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Trend */}
      <div style={{ background:C.card, borderRadius:14, padding:"20px 22px", border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.06em" }}>Monthly Revenue (₹L)</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:120 }}>
          {revByMonth.map((r,i) => (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:10, color:C.accent, fontWeight:700 }}>{r.v}</span>
              <div style={{ width:"100%", borderRadius:"5px 5px 0 0", background:`linear-gradient(to top, ${C.accent}30, ${C.accent})`, height:`${(r.v/maxRev)*90}%`, minHeight:6, transition:"height .4s" }}/>
              <span style={{ fontSize:9.5, color:C.textDim, fontWeight:600 }}>{r.l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
      {/* Today's Interviews */}
      <div style={{ background:C.card, borderRadius:14, padding:"20px 22px", border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <span style={{ fontSize:12, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em" }}>Today's Interviews</span>
          <button onClick={()=>setPage("interviews")} style={{ fontSize:11, color:C.accentLight, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>View All →</button>
        </div>
        {INTERVIEWS.filter(i=>i.date==="2026-03-25").map(i => (
          <div key={i.id} style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12.5, color:C.text, fontWeight:600 }}>{i.candidate}</div>
            <div style={{ fontSize:11, color:C.textMuted }}>{i.job} • {i.time}</div>
            <div style={{ display:"flex", gap:6, marginTop:5 }}>
              <Badge text={i.type} color={C.purple} />
              {i.mode==="Google Meet" && <Badge text="G Meet" color={C.green} />}
            </div>
          </div>
        ))}
      </div>

      {/* Critical Requirements */}
      <div style={{ background:C.card, borderRadius:14, padding:"20px 22px", border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:14, textTransform:"uppercase", letterSpacing:"0.06em" }}>Critical Requirements</div>
        {JOBS.filter(j=>j.priority==="Critical"&&j.status==="Open").map(j => (
          <div key={j.id} style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12.5, color:C.text, fontWeight:600 }}>{j.title}</div>
            <div style={{ fontSize:11, color:C.textMuted }}>{j.client} • {j.positions-j.filled} open</div>
            <div style={{ display:"flex", gap:6, marginTop:5 }}>
              <Badge text="CRITICAL" color={C.red} />
              <span style={{ fontSize:10, color:C.textDim }}>Due: {j.deadline}</span>
            </div>
          </div>
        ))}
      </div>

      {/* WhatsApp Activity */}
      <div style={{ background:C.card, borderRadius:14, padding:"20px 22px", border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <span style={{ fontSize:12, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em" }}>WhatsApp</span>
          <button onClick={()=>setPage("whatsapp")} style={{ fontSize:11, color:C.whatsapp, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>Open →</button>
        </div>
        {WHATSAPP_THREADS.slice(0,4).map(t => (
          <div key={t.id} style={{ padding:"8px 0", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:12, color:C.text, fontWeight:600 }}>{t.candidate}</div>
              <div style={{ fontSize:10.5, color:C.textMuted, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.lastMsg}</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:10, color:C.textDim }}>{t.time}</span>
              {t.unread > 0 && <span style={{ width:16, height:16, borderRadius:8, background:C.whatsapp, color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{t.unread}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>;
};

// ── CV PROCESSING HUB ──────────────────────────────────────────────────
const CVHub = () => {
  const [tab, setTab] = useState("overview");
  const weekData = { total:10247, parsed:9814, matched:7231, rejected:1583, duplicates:416, pending:433 };
  const sources = [{name:"Naukri",count:3842,pct:37.5},{name:"LinkedIn",count:2561,pct:25.0},{name:"Email/Direct",count:1847,pct:18.0},{name:"Indeed",count:1024,pct:10.0},{name:"Referrals",count:563,pct:5.5},{name:"Job Fairs",count:410,pct:4.0}];

  return <div>
    <div style={{ display:"flex", gap:8, marginBottom:20 }}>
      {["overview","upload","matching","duplicates"].map(t => <Pill key={t} text={t.charAt(0).toUpperCase()+t.slice(1)} active={tab===t} onClick={()=>setTab(t)} />)}
    </div>

    {tab==="overview" && <>
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:24 }}>
        <Stat label="CVs This Week" value={fmt(weekData.total)} sub="Avg 1,464/day" color={C.accent} icon={Icons.cv} />
        <Stat label="Auto-Parsed" value={`${((weekData.parsed/weekData.total)*100).toFixed(1)}%`} sub={`${fmt(weekData.parsed)} processed`} color={C.green} icon={Icons.zap} />
        <Stat label="AI Matched" value={`${((weekData.matched/weekData.total)*100).toFixed(1)}%`} sub={`${fmt(weekData.matched)} to open jobs`} color={C.purple} icon={Icons.target} />
        <Stat label="Duplicates Found" value={fmt(weekData.duplicates)} sub="Auto-merged" color={C.yellow} icon={Icons.filter} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.06em" }}>CV Sources — This Week</div>
          {sources.map(s => (
            <div key={s.name} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.text, marginBottom:5 }}>
                <span style={{ fontWeight:600 }}>{s.name}</span>
                <span style={{ color:C.textMuted }}>{fmt(s.count)} ({s.pct}%)</span>
              </div>
              <Bar value={s.pct} max={40} color={s.name==="Naukri"?"#5D5FEF":s.name==="LinkedIn"?C.accent:C.teal} h={6} />
            </div>
          ))}
        </div>
        <div style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.06em" }}>Processing Pipeline</div>
          {[{stage:"Received",count:weekData.total,c:C.textMuted},{stage:"Parsed & Extracted",count:weekData.parsed,c:C.accent},{stage:"Duplicate Check",count:weekData.parsed-weekData.duplicates,c:C.yellow},{stage:"AI Skill Matching",count:weekData.matched,c:C.purple},{stage:"Quality Scored",count:weekData.matched,c:C.teal},{stage:"Ready for Screening",count:weekData.matched-weekData.rejected,c:C.green}].map((s,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ width:8, height:8, borderRadius:4, background:s.c, flexShrink:0 }}/>
              <span style={{ flex:1, fontSize:12, color:C.text }}>{s.stage}</span>
              <span style={{ fontSize:13, fontWeight:700, color:s.c }}>{fmt(s.count)}</span>
            </div>
          ))}
        </div>
      </div>
    </>}

    {tab==="upload" && (
      <div style={{ background:C.card, borderRadius:14, padding:40, border:`2px dashed ${C.border}`, textAlign:"center" }}>
        <div style={{ color:C.accent, marginBottom:16 }}>{Icons.upload}</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.text, fontFamily:F.display, marginBottom:8 }}>Bulk CV Upload</div>
        <div style={{ fontSize:13, color:C.textMuted, marginBottom:24, maxWidth:400, margin:"0 auto 24px" }}>Drop CV files here or click to browse. Supports PDF, DOC, DOCX. Max 500 files per batch. AI will auto-parse, extract skills, and match to open requirements.</div>
        <Btn variant="primary" icon={Icons.upload}>Select Files</Btn>
        <div style={{ marginTop:20, display:"flex", justifyContent:"center", gap:24 }}>
          {[{l:"Naukri Bulk Export",c:"#5D5FEF"},{l:"LinkedIn Export",c:C.accent},{l:"Email Attachments",c:C.teal}].map(s => (
            <button key={s.l} style={{ padding:"10px 18px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:s.c, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F.body }}>{s.l}</button>
          ))}
        </div>
      </div>
    )}

    {tab==="matching" && (
      <div style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:F.display, marginBottom:16 }}>AI Match Results — Top Candidates</div>
        <Table columns={[
          { label:"Candidate", render:r=><span style={{fontWeight:600,color:C.text}}>{r.name}</span> },
          { label:"Match Score", render:r=><span style={{color:r.resumeScore>80?C.green:r.resumeScore>65?C.yellow:C.red,fontWeight:700}}>{r.resumeScore}%</span> },
          { label:"Role", key:"role" },
          { label:"Experience", key:"experience" },
          { label:"Source", key:"source" },
          { label:"Skills", render:r=><div style={{display:"flex",gap:3}}>{r.skills.slice(0,2).map(s=><span key={s} style={{fontSize:9.5,padding:"2px 7px",borderRadius:10,background:C.border,color:C.textMuted}}>{s}</span>)}</div> },
        ]} data={CANDIDATES.slice(0,12).sort((a,b)=>b.resumeScore-a.resumeScore)} />
      </div>
    )}

    {tab==="duplicates" && (
      <div style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:F.display, marginBottom:8 }}>Duplicate Detection</div>
        <div style={{ fontSize:12, color:C.textMuted, marginBottom:16 }}>{weekData.duplicates} duplicates auto-detected this week. 312 auto-merged, 104 flagged for review.</div>
        {[{name:"Amit Kumar",sources:["Naukri","LinkedIn"],match:"98% match"},{name:"Sneha Iyer",sources:["Indeed","Direct"],match:"95% match"},{name:"Rohit Tiwari",sources:["Naukri","Referral"],match:"92% match"}].map((d,i) => (
          <div key={i} style={{ padding:"12px 0", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{d.name}</span>
              <div style={{ display:"flex", gap:4, marginTop:4 }}>{d.sources.map(s=><Badge key={s} text={s} color={C.textMuted} />)}</div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <Badge text={d.match} color={C.yellow} />
              <Btn small variant="primary">Merge</Btn>
              <Btn small variant="secondary">Review</Btn>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>;
};

// ── CLIENTS ────────────────────────────────────────────────────────────
const ClientsPage = () => {
  const [search, setSearch] = useState(""); const [sel, setSel] = useState(null);
  const [tierFilter, setTierFilter] = useState("All");
  const f = CLIENTS.filter(c => {
    const m = c.name.toLowerCase().includes(search.toLowerCase()) || c.industry.toLowerCase().includes(search.toLowerCase());
    return m && (tierFilter==="All" || c.tier===tierFilter);
  });
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, gap:10, flexWrap:"wrap" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Search clients..." />
        {["All","Platinum","Gold","Silver"].map(t => <Pill key={t} text={t} active={tierFilter===t} onClick={()=>setTierFilter(t)} />)}
      </div>
      <Btn icon={Icons.plus}>Add Client</Btn>
    </div>
    <Table columns={[
      { label:"Company", render:r=><div><span style={{fontWeight:700,color:C.text}}>{r.name}</span><div style={{fontSize:10,color:C.textDim}}>{r.id}</div></div> },
      { label:"Tier", render:r=><Badge text={r.tier} color={r.tier==="Platinum"?C.purple:r.tier==="Gold"?C.yellow:C.textMuted} /> },
      { label:"Industry", key:"industry" },
      { label:"POC", key:"poc" },
      { label:"Open Reqs", render:r=><span style={{color:r.openReqs>5?C.accent:C.text,fontWeight:700}}>{r.openReqs}</span> },
      { label:"Placements", key:"totalPlacements" },
      { label:"Revenue", render:r=><span style={{color:C.green,fontWeight:700}}>{fmtL(r.revenue)}</span> },
      { label:"Fee", render:r=>`${r.feePercent}%` },
      { label:"Status", render:r=><Badge text={r.status} color={r.status==="Active"?C.green:C.yellow} /> },
    ]} data={f} onRow={setSel} />
    <Modal open={!!sel} onClose={()=>setSel(null)} title={sel?.name} width={600}>
      {sel && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        <Field label="Client ID" value={sel.id} /><Field label="Industry" value={sel.industry} />
        <Field label="Tier" value={sel.tier} /><Field label="Contact" value={`${sel.poc} (${sel.pocRole})`} />
        <Field label="Email" value={sel.email} /><Field label="Phone" value={sel.phone} />
        <Field label="Location" value={sel.location} /><Field label="Contract Until" value={sel.contractEnd} />
        <Field label="Open Requirements" value={sel.openReqs} /><Field label="Total Placements" value={sel.totalPlacements} />
        <Field label="Revenue" value={`₹${fmt(sel.revenue)}`} /><Field label="Fee %" value={`${sel.feePercent}%`} />
        <Field label="Payment Terms" value={sel.paymentTerms} /><Field label="Last Contact" value={sel.lastContact} />
      </div>}
    </Modal>
  </div>;
};

// ── CANDIDATES ─────────────────────────────────────────────────────────
const CandidatesPage = () => {
  const [search, setSearch] = useState(""); const [sel, setSel] = useState(null);
  const [statusF, setStatusF] = useState("All");
  const f = CANDIDATES.filter(c => {
    const m = c.name.toLowerCase().includes(search.toLowerCase()) || c.role.toLowerCase().includes(search.toLowerCase()) || c.skills.some(s=>s.toLowerCase().includes(search.toLowerCase()));
    return m && (statusF==="All" || c.status===statusF);
  });
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, gap:10, flexWrap:"wrap" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Name, role, skills..." />
        {["All","Active","In Pipeline","Placed"].map(s => <Pill key={s} text={s} active={statusF===s} onClick={()=>setStatusF(s)} />)}
      </div>
      <Btn icon={Icons.plus}>Add Candidate</Btn>
    </div>
    <Table columns={[
      { label:"Name", render:r=><div><span style={{fontWeight:700,color:C.text}}>{r.name}</span>{r.linkedinUrl && <span style={{marginLeft:6,color:C.accent}}>{Icons.linkedin}</span>}{r.naukriId && <span style={{marginLeft:4,fontSize:9,color:"#5D5FEF",fontWeight:700}}>N</span>}</div> },
      { label:"Role", key:"role" },
      { label:"Exp", key:"experience" },
      { label:"Score", render:r=><span style={{fontWeight:700,color:r.resumeScore>80?C.green:r.resumeScore>65?C.yellow:C.red}}>{r.resumeScore}</span> },
      { label:"Skills", render:r=><div style={{display:"flex",gap:3}}>{r.skills.slice(0,2).map(s=><span key={s} style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:C.border,color:C.textMuted}}>{s}</span>)}{r.skills.length>2&&<span style={{fontSize:9,color:C.textDim}}>+{r.skills.length-2}</span>}</div> },
      { label:"CTC", key:"currentCTC" },
      { label:"Expected", key:"expectedCTC" },
      { label:"Notice", key:"noticePeriod" },
      { label:"Source", key:"source" },
      { label:"WhatsApp", render:r=><Badge text={r.whatsapp} color={r.whatsapp==="Opted In"?C.whatsapp:C.textDim} /> },
      { label:"Status", render:r=><Badge text={r.status} color={r.status==="Active"?C.green:r.status==="In Pipeline"?C.accent:r.status==="Placed"?C.purple:r.status==="Offered"?C.teal:C.textMuted} /> },
    ]} data={f.slice(0,20)} onRow={setSel} />
    <div style={{ marginTop:12, fontSize:11, color:C.textDim }}>Showing {Math.min(20,f.length)} of {f.length} candidates</div>
    <Modal open={!!sel} onClose={()=>setSel(null)} title={sel?.name} width={580}>
      {sel && <div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <Field label="ID" value={sel.id} /><Field label="Role" value={sel.role} />
          <Field label="Experience" value={sel.experience} /><Field label="Location" value={sel.location} />
          <Field label="Email" value={sel.email} /><Field label="Phone" value={sel.phone} />
          <Field label="Current CTC" value={sel.currentCTC} /><Field label="Expected CTC" value={sel.expectedCTC} />
          <Field label="Notice Period" value={sel.noticePeriod} /><Field label="Source" value={sel.source} />
          <Field label="Resume Score" value={`${sel.resumeScore}/100`} /><Field label="WhatsApp" value={sel.whatsapp} />
          <Field label="Naukri ID" value={sel.naukriId || "Not linked"} /><Field label="LinkedIn" value={sel.linkedinUrl || "Not linked"} />
        </div>
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6, fontWeight:600 }}>Skills</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{sel.skills.map(s => <span key={s} style={{ fontSize:12, padding:"4px 12px", borderRadius:14, background:C.accentGlow, color:C.accentLight }}>{s}</span>)}</div>
        </div>
        <div style={{ display:"flex", gap:8, marginTop:18 }}>
          <Btn variant="whatsapp" icon={Icons.whatsapp} small>WhatsApp</Btn>
          <Btn variant="secondary" icon={Icons.mail} small>Email</Btn>
          <Btn variant="secondary" icon={Icons.phone} small>Call</Btn>
        </div>
      </div>}
    </Modal>
  </div>;
};

// ── JOBS ────────────────────────────────────────────────────────────────
const JobsPage = () => {
  const [search, setSearch] = useState(""); const [sel, setSel] = useState(null);
  const [statusF, setStatusF] = useState("Open");
  const f = JOBS.filter(j => {
    const m = j.title.toLowerCase().includes(search.toLowerCase()) || j.client.toLowerCase().includes(search.toLowerCase());
    return m && (statusF==="All" || j.status===statusF);
  });
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, gap:10, flexWrap:"wrap" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Job or client..." />
        {["All","Open","Closed"].map(s => <Pill key={s} text={s} active={statusF===s} onClick={()=>setStatusF(s)} />)}
      </div>
      <Btn icon={Icons.plus}>Add Requirement</Btn>
    </div>
    <Table columns={[
      { label:"ID", render:r=><span style={{color:C.textDim,fontSize:11}}>{r.id}</span> },
      { label:"Title", render:r=><span style={{fontWeight:700,color:C.text}}>{r.title}</span> },
      { label:"Client", key:"client" },
      { label:"CTC", key:"ctcRange" },
      { label:"Positions", render:r=><span>{r.filled}<span style={{color:C.textDim}}>/{r.positions}</span></span> },
      { label:"Submitted", key:"submitted" },
      { label:"Shortlisted", key:"shortlisted" },
      { label:"Recruiter", key:"recruiter" },
      { label:"Priority", render:r=><Badge text={r.priority} color={r.priority==="Critical"?C.red:r.priority==="High"?C.yellow:C.accent} /> },
      { label:"Deadline", key:"deadline" },
    ]} data={f} onRow={setSel} />
    <Modal open={!!sel} onClose={()=>setSel(null)} title={sel?.title} width={560}>
      {sel && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        <Field label="Job ID" value={sel.id} /><Field label="Client" value={sel.client} />
        <Field label="Location" value={sel.location} /><Field label="Type" value={sel.type} />
        <Field label="CTC Range" value={sel.ctcRange} /><Field label="Positions" value={`${sel.filled}/${sel.positions}`} />
        <Field label="Submitted" value={sel.submitted} /><Field label="Shortlisted" value={sel.shortlisted} />
        <Field label="Recruiter" value={sel.recruiter} /><Field label="Priority" value={sel.priority} />
        <Field label="Posted" value={sel.postedDate} /><Field label="Deadline" value={sel.deadline} />
        <div style={{ gridColumn:"1/-1" }}>
          <div style={{ fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5, fontWeight:600 }}>Required Skills</div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{sel.skills.map(s => <span key={s} style={{ fontSize:12, padding:"4px 12px", borderRadius:14, background:C.accentGlow, color:C.accentLight }}>{s}</span>)}</div>
        </div>
      </div>}
    </Modal>
  </div>;
};

// ── PIPELINE KANBAN ────────────────────────────────────────────────────
const PipelinePage = () => {
  const [pipeData, setPipeData] = useState(PIPELINE);
  const [sel, setSel] = useState(null);
  const move = (item, dir) => {
    const idx = PIPELINE_STAGES.indexOf(item.stage);
    const ni = idx + dir;
    if (ni < 0 || ni >= PIPELINE_STAGES.length) return;
    setPipeData(prev => prev.map(p => p.id===item.id ? {...p, stage: PIPELINE_STAGES[ni], updated: "2026-03-24"} : p));
  };

  return <div style={{ overflowX:"auto" }}>
    <div style={{ display:"flex", gap:10, minWidth:PIPELINE_STAGES.length*200, paddingBottom:8 }}>
      {PIPELINE_STAGES.map(stage => {
        const items = pipeData.filter(p => p.stage===stage);
        return (
          <div key={stage} style={{ width:200, flexShrink:0, background:C.surface, borderRadius:12, border:`1px solid ${C.border}`, display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"12px 14px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:7, height:7, borderRadius:4, background:STAGE_CLR[stage] }}/>
                <span style={{ fontSize:10.5, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.04em" }}>{stage.length > 16 ? stage.replace("to ","→ ").replace("Negotiation","Neg.") : stage}</span>
              </div>
              <span style={{ fontSize:11, color:C.textDim, fontWeight:700 }}>{items.length}</span>
            </div>
            <div style={{ padding:6, flex:1, display:"flex", flexDirection:"column", gap:6, maxHeight:500, overflowY:"auto" }}>
              {items.map(item => (
                <div key={item.id} onClick={()=>setSel(item)} style={{ background:C.card, borderRadius:10, padding:"10px 12px", border:`1px solid ${C.border}`, cursor:"pointer", transition:"border-color .15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=STAGE_CLR[stage]} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:3 }}>{item.candidate}</div>
                  <div style={{ fontSize:10, color:C.textMuted, marginBottom:2 }}>{item.job}</div>
                  <div style={{ fontSize:9.5, color:C.textDim }}>{item.client}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:item.score>80?C.green:item.score>65?C.yellow:C.textMuted }}>{item.score}</span>
                      <span style={{ fontSize:9, color:C.textDim }}>• {item.recruiter}</span>
                    </div>
                    <div style={{ display:"flex", gap:3 }}>
                      <button onClick={e=>{e.stopPropagation();move(item,-1)}} disabled={PIPELINE_STAGES.indexOf(item.stage)===0} style={{ width:20, height:20, borderRadius:5, border:`1px solid ${C.border}`, background:C.surface, color:C.textMuted, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, opacity:PIPELINE_STAGES.indexOf(item.stage)===0?.3:1 }}>←</button>
                      <button onClick={e=>{e.stopPropagation();move(item,1)}} disabled={PIPELINE_STAGES.indexOf(item.stage)===PIPELINE_STAGES.length-1} style={{ width:20, height:20, borderRadius:5, border:`1px solid ${C.border}`, background:C.surface, color:C.textMuted, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, opacity:PIPELINE_STAGES.indexOf(item.stage)===PIPELINE_STAGES.length-1?.3:1 }}>→</button>
                    </div>
                  </div>
                </div>
              ))}
              {items.length===0 && <div style={{ padding:14, textAlign:"center", color:C.textDim, fontSize:11 }}>Empty</div>}
            </div>
          </div>
        );
      })}
    </div>
    <Modal open={!!sel} onClose={()=>setSel(null)} title="Pipeline Details" width={480}>
      {sel && <div>
        <Field label="Candidate" value={sel.candidate} /><Field label="Job" value={sel.job} />
        <Field label="Client" value={sel.client} /><Field label="Stage" value={sel.stage} />
        <Field label="Score" value={`${sel.score}/100`} /><Field label="Recruiter" value={sel.recruiter} />
        <Field label="Last Updated" value={sel.updated} /><Field label="Notes" value={sel.notes} />
        {sel.interviewDate && <Field label="Interview" value={sel.interviewDate} />}
      </div>}
    </Modal>
  </div>;
};

// ── INTERVIEWS ─────────────────────────────────────────────────────────
const InterviewsPage = () => {
  const [sel, setSel] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const grouped = {};
  INTERVIEWS.forEach(i => { if (!grouped[i.date]) grouped[i.date] = []; grouped[i.date].push(i); });

  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
      <div style={{ display:"flex", gap:8 }}>
        <Pill text="All" active /><Pill text="Today" /><Pill text="This Week" /><Pill text="Pending" />
      </div>
      <Btn icon={Icons.plus} onClick={()=>setShowSchedule(true)}>Schedule Interview</Btn>
    </div>

    {Object.entries(grouped).sort().map(([date, items]) => (
      <div key={date} style={{ marginBottom:20 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>{new Date(date+"T00:00").toLocaleDateString("en-IN",{weekday:"long", day:"numeric", month:"short"})}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {items.map(i => (
            <div key={i.id} onClick={()=>setSel(i)} style={{ background:C.card, borderRadius:12, padding:"16px 20px", border:`1px solid ${C.border}`, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", transition:"border-color .15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                <div style={{ width:48, textAlign:"center" }}>
                  <div style={{ fontSize:16, fontWeight:800, color:C.accent, fontFamily:F.display }}>{i.time.split(" ")[0]}</div>
                  <div style={{ fontSize:10, color:C.textMuted }}>{i.time.split(" ")[1]}</div>
                </div>
                <div>
                  <div style={{ fontSize:13.5, fontWeight:700, color:C.text }}>{i.candidate}</div>
                  <div style={{ fontSize:11.5, color:C.textMuted }}>{i.job} — {i.client}</div>
                  <div style={{ display:"flex", gap:5, marginTop:5 }}>
                    <Badge text={i.type} color={C.purple} />
                    <Badge text={i.mode} color={i.mode==="Google Meet"?C.green:C.teal} />
                    <Badge text={i.status} color={i.status==="Completed"?C.green:i.status==="Scheduled"?C.accent:C.yellow} />
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                {i.link && <Btn small variant="success" icon={Icons.video}>Join Meet</Btn>}
                <Btn small variant="whatsapp" icon={Icons.whatsapp}>Remind</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}

    <Modal open={!!sel} onClose={()=>setSel(null)} title="Interview Details" width={500}>
      {sel && <div>
        <Field label="Candidate" value={sel.candidate} /><Field label="Job" value={sel.job} />
        <Field label="Client" value={sel.client} /><Field label="Date" value={sel.date} />
        <Field label="Time" value={sel.time} /><Field label="Type" value={sel.type} />
        <Field label="Mode" value={sel.mode} /><Field label="Interviewer" value={sel.interviewer} />
        <Field label="Status" value={sel.status} /><Field label="Recruiter" value={sel.recruiter} />
        {sel.link && <Field label="Meeting Link" value={sel.link} />}
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          {sel.link && <Btn variant="success" icon={Icons.video}>Open Google Meet</Btn>}
          <Btn variant="whatsapp" icon={Icons.whatsapp}>Send Reminder</Btn>
        </div>
      </div>}
    </Modal>

    <Modal open={showSchedule} onClose={()=>setShowSchedule(false)} title="Schedule Interview" width={520}>
      <div>
        {["Candidate","Job Requirement","Interview Type","Date","Time","Mode","Interviewer Name","Google Meet Link"].map(f => (
          <div key={f} style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:11, color:C.textMuted, marginBottom:4, fontWeight:600 }}>{f}</label>
            {f==="Mode" ? (
              <select style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:13, fontFamily:F.body }}>
                <option>Google Meet</option><option>In-Person</option><option>Phone</option>
              </select>
            ) : f==="Interview Type" ? (
              <select style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:13, fontFamily:F.body }}>
                <option>Screening</option><option>Technical</option><option>Client</option><option>HR</option><option>Final</option>
              </select>
            ) : (
              <input type={f==="Date"?"date":f==="Time"?"time":"text"} style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:13, fontFamily:F.body, boxSizing:"border-box" }} />
            )}
          </div>
        ))}
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
          <Btn variant="secondary" onClick={()=>setShowSchedule(false)}>Cancel</Btn>
          <Btn variant="primary" icon={Icons.check}>Schedule & Notify via WhatsApp</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

// ── WHATSAPP ───────────────────────────────────────────────────────────
const WhatsAppPage = () => {
  const [selThread, setSelThread] = useState(WHATSAPP_THREADS[0]);
  const [msg, setMsg] = useState("");
  const templates = [
    { name: "Interview Scheduled", text: "Hi {name}, your {type} interview for {job} at {client} is scheduled for {date} at {time}. {link ? 'Google Meet: '+link : 'Venue details will follow.'}. Best of luck!" },
    { name: "Profile Submitted", text: "Hi {name}, we've submitted your profile to {client} for the {job} role. We'll update you within 48 hours." },
    { name: "Offer Congratulations", text: "Congratulations {name}! Your offer from {client} for {job} at {ctc} has been confirmed. We'll share the offer letter shortly." },
    { name: "Follow Up", text: "Hi {name}, just checking in regarding the {job} opportunity at {client}. Are you still interested? Please let us know." },
    { name: "Document Request", text: "Hi {name}, congratulations on your selection! Please share the following documents: 1) Last 3 months payslips 2) Relieving letter 3) PAN & Aadhaar copy." },
  ];

  return <div style={{ display:"grid", gridTemplateColumns:"300px 1fr 260px", gap:0, height:"calc(100vh - 140px)", borderRadius:14, overflow:"hidden", border:`1px solid ${C.border}` }}>
    {/* Thread List */}
    <div style={{ background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"14px 14px 10px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <span style={{ color:C.whatsapp }}>{Icons.whatsapp}</span>
          <span style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:F.display }}>WhatsApp</span>
        </div>
        <SearchBox value="" onChange={()=>{}} placeholder="Search conversations..." />
      </div>
      <div style={{ flex:1, overflow:"auto" }}>
        {WHATSAPP_THREADS.map(t => (
          <div key={t.id} onClick={()=>setSelThread(t)} style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}`, cursor:"pointer", background:selThread?.id===t.id ? C.card : "transparent", transition:"background .1s" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
              <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{t.candidate}</span>
              <span style={{ fontSize:10, color:C.textDim }}>{t.time}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11, color:C.textMuted, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.lastMsg}</span>
              {t.unread>0 && <span style={{ minWidth:16, height:16, borderRadius:8, background:C.whatsapp, color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px" }}>{t.unread}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Chat Area */}
    <div style={{ background:C.bg, display:"flex", flexDirection:"column" }}>
      {selThread && <>
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`, background:C.surface }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{selThread.candidate}</div>
          <div style={{ fontSize:11, color:C.textMuted }}>{selThread.phone} • Last seen today</div>
        </div>
        <div style={{ flex:1, padding:20, display:"flex", flexDirection:"column", justifyContent:"flex-end", gap:10 }}>
          <div style={{ alignSelf:"flex-end", maxWidth:"70%", background:C.whatsapp+"20", borderRadius:"14px 14px 4px 14px", padding:"10px 14px" }}>
            <div style={{ fontSize:12.5, color:C.text, lineHeight:1.5 }}>{selThread.lastMsg}</div>
            <div style={{ fontSize:9.5, color:C.textDim, textAlign:"right", marginTop:4 }}>{selThread.time} ✓✓</div>
          </div>
        </div>
        <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}`, background:C.surface, display:"flex", gap:8 }}>
          <input value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Type a message..." style={{ flex:1, padding:"10px 14px", borderRadius:20, border:`1px solid ${C.border}`, background:C.card, color:C.text, fontSize:13, fontFamily:F.body, outline:"none" }} />
          <button style={{ width:40, height:40, borderRadius:20, background:C.whatsapp, border:"none", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{Icons.send}</button>
        </div>
      </>}
    </div>

    {/* Templates & Bulk */}
    <div style={{ background:C.surface, borderLeft:`1px solid ${C.border}`, padding:14, overflow:"auto" }}>
      <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 }}>Quick Templates</div>
      {templates.map((t,i) => (
        <div key={i} style={{ padding:"10px 12px", borderRadius:8, border:`1px solid ${C.border}`, marginBottom:8, cursor:"pointer", transition:"border-color .15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=C.whatsapp} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:4 }}>{t.name}</div>
          <div style={{ fontSize:10, color:C.textDim, lineHeight:1.4 }}>{t.text.slice(0,80)}...</div>
        </div>
      ))}
      <div style={{ marginTop:16, fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Bulk Actions</div>
      <Btn variant="whatsapp" small icon={Icons.send}>Broadcast to Pipeline</Btn>
      <div style={{ marginTop:8 }}><Btn variant="secondary" small>Export Chat Logs</Btn></div>
    </div>
  </div>;
};

// ── SOURCING (LinkedIn + Naukri) ───────────────────────────────────────
const SourcingPage = () => {
  const [tab, setTab] = useState("linkedin");
  const linkedinStats = { profilesViewed: 842, inMails: 156, responses: 48, conversionRate: "30.8%", pipelined: 23 };
  const naukriStats = { cvDownloaded: 3842, relevant: 2104, contacted: 876, responded: 312, pipelined: 145 };

  return <div>
    <div style={{ display:"flex", gap:8, marginBottom:20 }}>
      <Pill text="LinkedIn" active={tab==="linkedin"} onClick={()=>setTab("linkedin")} />
      <Pill text="Naukri" active={tab==="naukri"} onClick={()=>setTab("naukri")} />
      <Pill text="Indeed" active={tab==="indeed"} onClick={()=>setTab("indeed")} />
      <Pill text="Job Fairs" active={tab==="fairs"} onClick={()=>setTab("fairs")} />
    </div>

    {tab==="linkedin" && <div>
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:20 }}>
        <Stat label="Profiles Viewed" value={linkedinStats.profilesViewed} color={C.accent} icon={Icons.linkedin} />
        <Stat label="InMails Sent" value={linkedinStats.inMails} color={C.purple} icon={Icons.send} />
        <Stat label="Response Rate" value={linkedinStats.conversionRate} color={C.green} icon={Icons.trendUp} />
        <Stat label="Added to Pipeline" value={linkedinStats.pipelined} color={C.teal} icon={Icons.pipeline} />
      </div>
      <div style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:F.display, marginBottom:6 }}>LinkedIn Recruiter Integration</div>
        <div style={{ fontSize:12, color:C.textMuted, marginBottom:16 }}>Connect your LinkedIn Recruiter account to auto-sync sourced profiles, InMail responses, and candidate data directly into the CRM pipeline.</div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="primary" icon={Icons.link}>Connect LinkedIn Recruiter</Btn>
          <Btn variant="secondary" icon={Icons.upload}>Import LinkedIn CSV</Btn>
        </div>
        <div style={{ marginTop:20, borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>Recent LinkedIn Sourced</div>
          <Table columns={[
            { label:"Name", render:r=><span style={{fontWeight:600,color:C.text}}>{r.name}</span> },
            { label:"Role", key:"role" },
            { label:"LinkedIn", render:r=>r.linkedinUrl ? <span style={{color:C.accent,fontSize:11}}>Connected</span> : <span style={{color:C.textDim,fontSize:11}}>—</span> },
            { label:"Score", render:r=><span style={{fontWeight:700,color:r.resumeScore>75?C.green:C.yellow}}>{r.resumeScore}</span> },
          ]} data={CANDIDATES.filter(c=>c.source==="LinkedIn").slice(0,6)} />
        </div>
      </div>
    </div>}

    {tab==="naukri" && <div>
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:20 }}>
        <Stat label="CVs Downloaded" value={fmt(naukriStats.cvDownloaded)} color="#5D5FEF" icon={Icons.cv} />
        <Stat label="Relevant Matches" value={fmt(naukriStats.relevant)} color={C.green} icon={Icons.check} />
        <Stat label="Contacted" value={naukriStats.contacted} color={C.yellow} icon={Icons.phone} />
        <Stat label="Added to Pipeline" value={naukriStats.pipelined} color={C.teal} icon={Icons.pipeline} />
      </div>
      <div style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:F.display, marginBottom:6 }}>Naukri RESDEX Integration</div>
        <div style={{ fontSize:12, color:C.textMuted, marginBottom:16 }}>Auto-sync Naukri RESDEX searches, bulk download CVs, and import candidate profiles with parsed data directly into FX CRM. Track Naukri application responses in real-time.</div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="primary" icon={Icons.link}>Connect Naukri RESDEX</Btn>
          <Btn variant="secondary" icon={Icons.upload}>Bulk Import Naukri CVs</Btn>
        </div>
        <div style={{ marginTop:20, borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>Recent Naukri Imports</div>
          <Table columns={[
            { label:"Name", render:r=><span style={{fontWeight:600,color:C.text}}>{r.name}</span> },
            { label:"Role", key:"role" },
            { label:"Naukri ID", render:r=>r.naukriId ? <span style={{color:"#5D5FEF",fontSize:11}}>{r.naukriId}</span> : "—" },
            { label:"Score", render:r=><span style={{fontWeight:700,color:r.resumeScore>75?C.green:C.yellow}}>{r.resumeScore}</span> },
          ]} data={CANDIDATES.filter(c=>c.source==="Naukri").slice(0,6)} />
        </div>
      </div>
    </div>}

    {(tab==="indeed"||tab==="fairs") && <div style={{ background:C.card, borderRadius:14, padding:40, border:`1px solid ${C.border}`, textAlign:"center" }}>
      <div style={{ fontSize:18, fontWeight:700, color:C.text, fontFamily:F.display, marginBottom:8 }}>{tab==="indeed"?"Indeed":"Job Fair"} Integration</div>
      <div style={{ fontSize:13, color:C.textMuted, marginBottom:20 }}>Connect your {tab==="indeed"?"Indeed Employer":"event management"} account to auto-import candidates.</div>
      <Btn icon={Icons.link}>Connect</Btn>
    </div>}
  </div>;
};

// ── TEAM ───────────────────────────────────────────────────────────────
const TeamPage = () => (
  <div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:14 }}>
      {TEAM.map(m => {
        const pct = Math.round(m.revenue/m.target*100);
        return (
          <div key={m.id} style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:C.text, fontFamily:F.display }}>{m.name}</div>
                <div style={{ fontSize:12, color:C.textMuted }}>{m.role}</div>
              </div>
              <div style={{ width:44, height:44, borderRadius:22, background:m.color+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:m.color }}>{m.avatar}</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginBottom:16, textAlign:"center" }}>
              {[{l:"Pipeline",v:m.activePipeline},{l:"Placed",v:m.placements},{l:"CVs/Wk",v:m.cvsProcessed},{l:"Eff.",v:`${m.efficiency}%`}].map(s => (
                <div key={s.l}><div style={{ fontSize:18, fontWeight:800, color:C.text, fontFamily:F.display }}>{s.v}</div><div style={{ fontSize:9.5, color:C.textDim, fontWeight:600 }}>{s.l}</div></div>
              ))}
            </div>
            <div style={{ marginBottom:5, display:"flex", justifyContent:"space-between", fontSize:11, color:C.textMuted }}>
              <span>Revenue: {fmtL(m.revenue)}</span><span>{pct}% of {fmtL(m.target)}</span>
            </div>
            <Bar value={m.revenue} max={m.target} color={pct>=75?C.green:pct>=50?C.yellow:C.red} h={6} />
          </div>
        );
      })}
    </div>
  </div>
);

// ── REPORTS ─────────────────────────────────────────────────────────────
const ReportsPage = () => {
  const totalRev = CLIENTS.reduce((s,c)=>s+c.revenue,0);
  const totalPlacements = CLIENTS.reduce((s,c)=>s+c.totalPlacements,0);
  const activeClients = CLIENTS.filter(c=>c.status==="Active").length;
  const byIndustry = {}; CLIENTS.forEach(c => { byIndustry[c.industry] = (byIndustry[c.industry]||0)+c.revenue; });
  const indData = Object.entries(byIndustry).sort((a,b)=>b[1]-a[1]);
  const maxInd = indData[0]?.[1]||1;

  return <div>
    <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:24 }}>
      <Stat label="Total Revenue (FY26)" value={`₹${(totalRev/100000).toFixed(0)}L`} color={C.green} icon={Icons.trendUp} />
      <Stat label="Total Placements" value={totalPlacements} color={C.purple} icon={Icons.award} />
      <Stat label="Active Clients" value={activeClients} color={C.accent} icon={Icons.clients} />
      <Stat label="Avg. Days to Fill" value="28" sub="Target: 25" color={C.yellow} icon={Icons.clock} />
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
      <div style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.06em" }}>Revenue by Industry</div>
        {indData.map(([ind,rev]) => (
          <div key={ind} style={{ marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.text, marginBottom:5 }}>
              <span style={{ fontWeight:600 }}>{ind}</span><span style={{ color:C.green, fontWeight:700 }}>{fmtL(rev)}</span>
            </div>
            <Bar value={rev} max={maxInd} color={C.green} h={6} />
          </div>
        ))}
      </div>
      <div style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.06em" }}>Top Clients by Revenue</div>
        {CLIENTS.sort((a,b)=>b.revenue-a.revenue).slice(0,6).map((c,i) => (
          <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ width:22, height:22, borderRadius:11, background:C.accent+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:C.accent }}>{i+1}</span>
              <div>
                <div style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{c.name}</div>
                <div style={{ fontSize:10, color:C.textDim }}>{c.totalPlacements} placements</div>
              </div>
            </div>
            <span style={{ fontSize:13, fontWeight:700, color:C.green }}>{fmtL(c.revenue)}</span>
          </div>
        ))}
      </div>
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14 }}>
      {[{l:"CV-to-Screening",v:"71%",c:C.accent},{l:"Screening-to-Submit",v:"54%",c:C.purple},{l:"Submit-to-Offer",v:"22%",c:C.yellow},{l:"Offer Acceptance",v:"87%",c:C.green}].map(s => (
        <div key={s.l} style={{ background:C.card, borderRadius:14, padding:22, border:`1px solid ${C.border}`, textAlign:"center" }}>
          <div style={{ fontSize:30, fontWeight:800, color:s.c, fontFamily:F.display }}>{s.v}</div>
          <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>{s.l}</div>
        </div>
      ))}
    </div>
  </div>;
};

// ════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ════════════════════════════════════════════════════════════════════════

const NAV = [
  { id:"dashboard", label:"Command Center", icon: Icons.dashboard },
  { id:"cv", label:"CV Processing", icon: Icons.cv },
  { id:"clients", label:"Clients", icon: Icons.clients },
  { id:"candidates", label:"Candidates", icon: Icons.candidates },
  { id:"jobs", label:"Requirements", icon: Icons.jobs },
  { id:"pipeline", label:"Pipeline", icon: Icons.pipeline },
  { id:"interviews", label:"Interviews", icon: Icons.interviews },
  { id:"whatsapp", label:"WhatsApp", icon: Icons.whatsapp },
  { id:"sourcing", label:"Sourcing", icon: Icons.sourcing },
  { id:"team", label:"Team", icon: Icons.team },
  { id:"reports", label:"Reports", icon: Icons.reports },
];

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => { const t = setInterval(()=>setTime(new Date()), 60000); return ()=>clearInterval(t); }, []);

  const pageTitle = NAV.find(n=>n.id===page)?.label || "Command Center";
  const unreadWA = WHATSAPP_THREADS.reduce((s,t)=>s+t.unread, 0);

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, color:C.text, fontFamily:F.body, overflow:"hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Satoshi:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <link href="https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap" rel="stylesheet" />

      {/* ── Sidebar ── */}
      <aside style={{ width:collapsed?62:240, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", transition:"width .2s ease", overflow:"hidden", flexShrink:0 }}>
        {/* Brand */}
        <div style={{ padding:collapsed?"16px 10px":"16px 18px", display:"flex", alignItems:"center", gap:12, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ width:36, height:36, borderRadius:8, background:`linear-gradient(135deg, ${C.accent}, #1E40AF)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:900, color:"#fff", fontFamily:F.display, flexShrink:0, letterSpacing:"-0.02em" }}>FX</div>
          {!collapsed && <div>
            <div style={{ fontSize:13.5, fontWeight:800, color:C.text, fontFamily:F.display, letterSpacing:"-0.02em" }}>FX Consulting</div>
            <div style={{ fontSize:9.5, color:C.textDim, fontWeight:600 }}>fxconsulting.in</div>
          </div>}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:"10px 6px", overflowY:"auto" }}>
          {NAV.map(item => (
            <button key={item.id} onClick={()=>setPage(item.id)} style={{ display:"flex", alignItems:"center", gap:11, width:"100%", padding:collapsed?"10px 0":"10px 12px", borderRadius:9, border:"none", background:page===item.id ? C.accentGlow : "transparent", color:page===item.id ? C.accentLight : C.textMuted, fontSize:12.5, fontWeight:page===item.id ? 700 : 500, cursor:"pointer", fontFamily:F.body, transition:"all .12s", justifyContent:collapsed?"center":"flex-start", marginBottom:1, position:"relative" }}>
              {item.icon}
              {!collapsed && item.label}
              {item.id==="whatsapp" && unreadWA>0 && <span style={{ position:collapsed?"absolute":"static", top:collapsed?2:undefined, right:collapsed?4:undefined, minWidth:16, height:16, borderRadius:8, background:C.whatsapp, color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", marginLeft:collapsed?0:"auto" }}>{unreadWA}</span>}
            </button>
          ))}
        </nav>

        {/* Collapse */}
        <button onClick={()=>setCollapsed(p=>!p)} style={{ padding:14, border:"none", background:"none", color:C.textDim, cursor:"pointer", borderTop:`1px solid ${C.border}`, display:"flex", justifyContent:"center" }}>
          <span style={{ transform:collapsed?"rotate(0deg)":"rotate(180deg)", transition:"transform .2s", display:"flex" }}>{Icons.chevR}</span>
        </button>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Header */}
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 26px", borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.surface }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:C.text, margin:0, fontFamily:F.display, letterSpacing:"-0.02em" }}>{pageTitle}</h1>
            <div style={{ fontSize:10.5, color:C.textDim, marginTop:2, fontWeight:500 }}>{time.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} • 10,247 CVs processed this week</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ padding:"7px 14px", borderRadius:8, background:C.greenGlow, display:"flex", alignItems:"center", gap:6, fontSize:11, color:C.green, fontWeight:700 }}>
              <div style={{ width:6, height:6, borderRadius:3, background:C.green, animation:"pulse 2s infinite" }}/>
              Live
            </div>
            <div style={{ position:"relative", cursor:"pointer", color:C.textMuted }}>{Icons.bell}<div style={{ position:"absolute", top:-2, right:-2, width:7, height:7, borderRadius:4, background:C.red }}/></div>
            <div style={{ width:34, height:34, borderRadius:17, background:`linear-gradient(135deg, ${C.accent}, #1E40AF)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:"#fff", fontFamily:F.display }}>K</div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex:1, overflow:"auto", padding:"22px 26px" }}>
          {page==="dashboard" && <CommandCenter setPage={setPage} />}
          {page==="cv" && <CVHub />}
          {page==="clients" && <ClientsPage />}
          {page==="candidates" && <CandidatesPage />}
          {page==="jobs" && <JobsPage />}
          {page==="pipeline" && <PipelinePage />}
          {page==="interviews" && <InterviewsPage />}
          {page==="whatsapp" && <WhatsAppPage />}
          {page==="sourcing" && <SourcingPage />}
          {page==="team" && <TeamPage />}
          {page==="reports" && <ReportsPage />}
        </div>
      </main>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        * { scrollbar-width:thin; scrollbar-color: ${C.border} transparent; }
        *::-webkit-scrollbar { width:6px; height:6px; }
        *::-webkit-scrollbar-track { background:transparent; }
        *::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
        input::placeholder { color: ${C.textDim}; }
        select { outline:none; }
      `}</style>
    </div>
  );
}
