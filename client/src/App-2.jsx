import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════
// FX CONSULTING — RECRUITMENT CRM
// Inspired by Greenhouse (structured pipelines, scorecards, prospect pools)
// + Workday (unified hub, AI matching, candidate engagement, analytics)
// Built for 10,000 CV/week agency throughput
// ═══════════════════════════════════════════════════════════════════════

// ── DATA LAYER ─────────────────────────────────────────────────────────
const CLIENTS = [
  { id: "C001", name: "BB", industry: "Technology", poc: "Nidhi", pocRole: "SPOC", email: "", phone: "", location: "Bangalore", status: "Active", tier: "Gold", openReqs: 4, totalPlacements: 12, revenue: 1800000, lastContact: "2026-03-22", contractEnd: "2027-03-31", paymentTerms: "Net 30", feePercent: 8.33 },
  { id: "C002", name: "StatusNeo", industry: "IT Services", poc: "Rishabh", pocRole: "SPOC", email: "", phone: "", location: "Mumbai", status: "Active", tier: "Silver", openReqs: 1, totalPlacements: 5, revenue: 750000, lastContact: "2026-03-20", contractEnd: "2026-12-31", paymentTerms: "Net 30", feePercent: 8.33 },
  { id: "C003", name: "Shaadi.com", industry: "Internet", poc: "Naazish Butt", pocRole: "SPOC", email: "", phone: "", location: "Mumbai", status: "Active", tier: "Silver", openReqs: 1, totalPlacements: 3, revenue: 450000, lastContact: "2026-03-18", contractEnd: "2026-12-31", paymentTerms: "Net 30", feePercent: 8.33 },
  { id: "C004", name: "TT", industry: "HVAC / Engineering", poc: "Hrishab", pocRole: "SPOC", email: "", phone: "", location: "Pan India", status: "Active", tier: "Platinum", openReqs: 22, totalPlacements: 28, revenue: 4200000, lastContact: "2026-03-23", contractEnd: "2027-06-30", paymentTerms: "Net 30", feePercent: 8.33 },
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
  { id: "JB001", title: "Sr EM Bigdata", client: "BB", clientId: "C001", location: "Bangalore", type: "Permanent", ctcRange: "1.20 CPA", positions: 1, filled: 0, submitted: 3, shortlisted: 1, status: "Open", priority: "Medium", postedDate: "2026-03-01", deadline: "2026-05-01", skills: ["Big Data","Hadoop","Spark"], recruiter: "Kavita" },
  { id: "JB002", title: "Lead Data Analyst", client: "BB", clientId: "C001", location: "Bangalore", type: "Permanent", ctcRange: "Up to 40 LPA", positions: 1, filled: 0, submitted: 4, shortlisted: 2, status: "Open", priority: "Critical", postedDate: "2026-03-01", deadline: "2026-04-15", skills: ["Data Analytics","SQL","Python"], recruiter: "Kavita" },
  { id: "JB003", title: "PE Mobile", client: "BB", clientId: "C001", location: "Bangalore", type: "Permanent", ctcRange: "TBD", positions: 1, filled: 0, submitted: 2, shortlisted: 0, status: "Open", priority: "High", postedDate: "2026-03-05", deadline: "2026-04-30", skills: ["Mobile","iOS","Android"], recruiter: "Kavita" },
  { id: "JB004", title: "Product Analyst", client: "BB", clientId: "C001", location: "Bangalore", type: "Permanent", ctcRange: "Up to 22 LPA", positions: 1, filled: 0, submitted: 5, shortlisted: 2, status: "Open", priority: "High", postedDate: "2026-03-05", deadline: "2026-04-30", skills: ["Product Analytics","SQL","Data"], recruiter: "Kavita" },
  { id: "JB005", title: "Solution Architect - Java", client: "StatusNeo", clientId: "C002", location: "Mumbai", type: "Permanent", ctcRange: "Up to 34 LPA", positions: 1, filled: 0, submitted: 3, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-10", deadline: "2026-04-30", skills: ["Java","Architecture","Microservices"], recruiter: "Kanchan" },
  { id: "JB006", title: "Data Scientist", client: "Shaadi.com", clientId: "C003", location: "Mumbai", type: "Permanent", ctcRange: "Up to 22 LPA", positions: 1, filled: 0, submitted: 4, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-10", deadline: "2026-04-30", skills: ["Data Science","Python","ML"], recruiter: "Kanchan" },
  { id: "JB007", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Noida", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 1, filled: 0, submitted: 6, shortlisted: 2, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB008", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Greater Noida", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 1, filled: 0, submitted: 4, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB009", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Chandigarh", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 1, filled: 0, submitted: 3, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB010", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Hyderabad", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 1, filled: 0, submitted: 5, shortlisted: 2, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB011", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Ahmedabad", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 2, filled: 0, submitted: 4, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB012", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Mumbai", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 1, filled: 0, submitted: 3, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB013", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Kolkata", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 1, filled: 0, submitted: 2, shortlisted: 0, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB014", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Chennai", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 2, filled: 0, submitted: 5, shortlisted: 2, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB015", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Gurugram", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 1, filled: 0, submitted: 3, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB016", title: "Asst. Project Manager", client: "TT", clientId: "C004", location: "Mumbai", type: "Permanent", ctcRange: "Up to 15 LPA", positions: 1, filled: 0, submitted: 2, shortlisted: 1, status: "Open", priority: "Medium", postedDate: "2026-03-05", deadline: "2026-05-05", skills: ["Project Management","HVAC"], recruiter: "Abhishek" },
  { id: "JB017", title: "Asst. Project Manager", client: "TT", clientId: "C004", location: "Hyderabad", type: "Permanent", ctcRange: "Up to 15 LPA", positions: 1, filled: 0, submitted: 2, shortlisted: 0, status: "Open", priority: "Medium", postedDate: "2026-03-05", deadline: "2026-05-05", skills: ["Project Management","HVAC"], recruiter: "Abhishek" },
  { id: "JB018", title: "Sr. Service Eng Data Center", client: "TT", clientId: "C004", location: "Hyderabad", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 4, filled: 0, submitted: 6, shortlisted: 2, status: "Open", priority: "Medium", postedDate: "2026-03-05", deadline: "2026-05-05", skills: ["Data Center","HVAC","Service"], recruiter: "Abhishek" },
  { id: "JB019", title: "HVAC Sales", client: "TT", clientId: "C004", location: "Hyderabad", type: "Permanent", ctcRange: "Up to 27 LPA", positions: 1, filled: 0, submitted: 3, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-05", deadline: "2026-04-30", skills: ["HVAC","Sales"], recruiter: "Abhishek" },
  { id: "JB020", title: "Unitary Sales Leader", client: "TT", clientId: "C004", location: "Mumbai", type: "Permanent", ctcRange: "Up to 60 LPA", positions: 1, filled: 0, submitted: 1, shortlisted: 0, status: "Open", priority: "High", postedDate: "2026-03-05", deadline: "2026-04-30", skills: ["Unitary","Sales","Leadership"], recruiter: "Abhishek" },
  { id: "JB021", title: "Zonal Head - ELV", client: "TT", clientId: "C004", location: "North India", type: "Permanent", ctcRange: "Up to 40 LPA", positions: 1, filled: 0, submitted: 2, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-05", deadline: "2026-04-30", skills: ["ELV","Zonal Head","Leadership"], recruiter: "Abhishek" },
  { id: "JB022", title: "VRF Sales", client: "TT", clientId: "C004", location: "Mumbai & Pune", type: "Permanent", ctcRange: "Up to 27 LPA", positions: 1, filled: 0, submitted: 3, shortlisted: 1, status: "Open", priority: "High", postedDate: "2026-03-05", deadline: "2026-04-30", skills: ["VRF","HVAC","Sales"], recruiter: "Abhishek" },
  { id: "JB023", title: "Sr. Service Engineer", client: "TT", clientId: "C004", location: "Vizag & Trivandrum", type: "Permanent", ctcRange: "Up to 12 LPA", positions: 2, filled: 0, submitted: 2, shortlisted: 0, status: "Open", priority: "High", postedDate: "2026-03-01", deadline: "2026-04-30", skills: ["HVAC","Service","Engineering"], recruiter: "Abhishek" },
  { id: "JB024", title: "AHU Sales", client: "TT", clientId: "C004", location: "Chennai", type: "Permanent", ctcRange: "Up to 27 LPA", positions: 1, filled: 0, submitted: 0, shortlisted: 0, status: "On Hold", priority: "High", postedDate: "2026-03-01", deadline: "2026-05-01", skills: ["AHU","HVAC","Sales"], recruiter: "Abhishek" },
  { id: "JB025", title: "Service Sales", client: "TT", clientId: "C004", location: "Hyderabad", type: "Permanent", ctcRange: "TBD", positions: 1, filled: 0, submitted: 0, shortlisted: 0, status: "On Hold", priority: "High", postedDate: "2026-03-01", deadline: "2026-05-01", skills: ["Service Sales","HVAC"], recruiter: "Abhishek" },
  { id: "JB026", title: "Unitary Sales", client: "TT", clientId: "C004", location: "Jaipur & Chandigarh", type: "Permanent", ctcRange: "Up to 27 LPA", positions: 1, filled: 0, submitted: 0, shortlisted: 0, status: "On Hold", priority: "High", postedDate: "2026-03-01", deadline: "2026-05-01", skills: ["Unitary","HVAC","Sales"], recruiter: "Abhishek" },
  { id: "JB027", title: "Gurugram & Bangalore Role", client: "TT", clientId: "C004", location: "Gurugram & Bangalore", type: "Permanent", ctcRange: "Up to 30 LPA", positions: 1, filled: 0, submitted: 2, shortlisted: 0, status: "Open", priority: "Medium", postedDate: "2026-03-05", deadline: "2026-05-05", skills: ["HVAC"], recruiter: "Abhishek" },
];

const PIPELINE_STAGES = ["Sourced","Screening","Submitted to Client","Client Interview","Technical Round","HR Round","Offer Negotiation","Offer Accepted","Joined"];
const STAGE_CLR = {"Sourced":"#64748B","Screening":"#3B82F6","Submitted to Client":"#6366F1","Client Interview":"#8B5CF6","Technical Round":"#F59E0B","HR Round":"#EC4899","Offer Negotiation":"#14B8A6","Offer Accepted":"#10B981","Joined":"#059669"};

const PIPELINE = [
  { id: 1, candidateId: "CN0001", candidate: "Vikash Rawat", jobId: "JB007", job: "Sr. Service Engineer", client: "TT", stage: "Technical Round", recruiter: "Abhishek", updated: "2026-03-22", score: 78, notes: "HVAC exp 4 yrs, Noida location OK" },
  { id: 2, candidateId: "CN0002", candidate: "Deepak Sharma", jobId: "JB002", job: "Lead Data Analyst", client: "BB", stage: "Screening", recruiter: "Kavita", updated: "2026-03-23", score: 72, notes: "8 yrs analytics, strong SQL" },
  { id: 3, candidateId: "CN0003", candidate: "Rajesh Kumar", jobId: "JB010", job: "Sr. Service Engineer", client: "TT", stage: "Client Interview", recruiter: "Abhishek", updated: "2026-03-21", score: 80, notes: "Hyderabad based, 5 yrs HVAC" },
  { id: 4, candidateId: "CN0004", candidate: "Priya Mehta", jobId: "JB005", job: "Solution Architect - Java", client: "StatusNeo", stage: "Submitted to Client", recruiter: "Kanchan", updated: "2026-03-24", score: 85, notes: "12 yrs Java, microservices expert" },
  { id: 5, candidateId: "CN0005", candidate: "Amit Pandey", jobId: "JB020", job: "Unitary Sales Leader", client: "TT", stage: "Sourced", recruiter: "Abhishek", updated: "2026-03-24", score: 70, notes: "18 yrs sales leadership exp" },
  { id: 6, candidateId: "CN0006", candidate: "Sneha Jain", jobId: "JB006", job: "Data Scientist", client: "Shaadi.com", stage: "HR Round", recruiter: "Kanchan", updated: "2026-03-23", score: 82, notes: "4 yrs ML, Python expert, Mumbai based" },
  { id: 7, candidateId: "CN0007", candidate: "Ravi Tomar", jobId: "JB014", job: "Sr. Service Engineer", client: "TT", stage: "Offer Negotiation", recruiter: "Abhishek", updated: "2026-03-22", score: 76, notes: "Chennai, 3 yrs, asking 14 LPA" },
  { id: 8, candidateId: "CN0008", candidate: "Mohit Verma", jobId: "JB019", job: "HVAC Sales", client: "TT", stage: "Screening", recruiter: "Saurabh", updated: "2026-03-23", score: 68, notes: "Hyderabad, 5 yrs HVAC sales" },
  { id: 9, candidateId: "CN0009", candidate: "Kavita Rawat", jobId: "JB004", job: "Product Analyst", client: "BB", stage: "Technical Round", recruiter: "Kavita", updated: "2026-03-22", score: 74, notes: "2.5 yrs, Bangalore, good SQL" },
  { id: 10, candidateId: "CN0010", candidate: "Suresh Negi", jobId: "JB015", job: "Sr. Service Engineer", client: "TT", stage: "Sourced", recruiter: "Karan", updated: "2026-03-24", score: 60, notes: "Gurugram, 3 yrs experience" },
  { id: 11, candidateId: "CN0011", candidate: "Anita Bisht", jobId: "JB021", job: "Zonal Head - ELV", client: "TT", stage: "Submitted to Client", recruiter: "Abhishek", updated: "2026-03-22", score: 88, notes: "16 yrs, North India network, strong profile" },
  { id: 12, candidateId: "CN0012", candidate: "Sanjay Thakur", jobId: "JB011", job: "Sr. Service Engineer", client: "TT", stage: "Joined", recruiter: "Abhishek", updated: "2026-03-15", score: 82, notes: "Joined March 15, Ahmedabad" },
];

const TEAM = [
  { id: 1, name: "Kanchan", role: "Co-Founder", avatar: "KS", color: "#3B82F6", activePipeline: 8, placements: 24, submissions: 85, cvsProcessed: 2800, revenue: 3600000, target: 5000000, efficiency: 88 },
  { id: 2, name: "Kavita", role: "Co-Founder", avatar: "KK", color: "#8B5CF6", activePipeline: 12, placements: 20, submissions: 78, cvsProcessed: 3200, revenue: 3000000, target: 5000000, efficiency: 84 },
  { id: 3, name: "Abhishek", role: "Account Manager", avatar: "AJ", color: "#EC4899", activePipeline: 22, placements: 14, submissions: 62, cvsProcessed: 2200, revenue: 2100000, target: 3000000, efficiency: 80 },
  { id: 4, name: "Radhika", role: "Account Manager", avatar: "RP", color: "#F59E0B", activePipeline: 6, placements: 8, submissions: 40, cvsProcessed: 1500, revenue: 1200000, target: 3000000, efficiency: 74 },
  { id: 5, name: "Neha", role: "Account Manager", avatar: "NB", color: "#14B8A6", activePipeline: 5, placements: 4, submissions: 28, cvsProcessed: 1000, revenue: 600000, target: 3000000, efficiency: 70 },
  { id: 6, name: "Saurabh", role: "Recruiter", avatar: "SG", color: "#10B981", activePipeline: 10, placements: 3, submissions: 35, cvsProcessed: 1200, revenue: 450000, target: 2000000, efficiency: 68 },
  { id: 7, name: "Karan", role: "Recruiter", avatar: "KN", color: "#6366F1", activePipeline: 8, placements: 2, submissions: 25, cvsProcessed: 900, revenue: 300000, target: 2000000, efficiency: 65 },
  { id: 8, name: "Bhumika", role: "Account Manager", avatar: "BD", color: "#D946EF", activePipeline: 4, placements: 3, submissions: 22, cvsProcessed: 800, revenue: 450000, target: 3000000, efficiency: 66 },
  { id: 9, name: "Jyoti", role: "Recruiter", avatar: "JA", color: "#F97316", activePipeline: 6, placements: 1, submissions: 18, cvsProcessed: 600, revenue: 150000, target: 2000000, efficiency: 60 },
  { id: 10, name: "Priya C", role: "Recruiter", avatar: "PC", color: "#EF4444", activePipeline: 5, placements: 1, submissions: 15, cvsProcessed: 500, revenue: 150000, target: 2000000, efficiency: 58 },
];

const INTERVIEWS = [
  { id: 1, candidate: "Vikash Rawat", job: "Sr. Service Engineer", client: "TT", date: "2026-03-25", time: "10:00 AM", type: "Technical", mode: "Google Meet", link: "meet.google.com/fx-tt-001", interviewer: "Hrishab", status: "Scheduled", recruiter: "Abhishek" },
  { id: 2, candidate: "Rajesh Kumar", job: "Sr. Service Engineer", client: "TT", date: "2026-03-25", time: "02:00 PM", type: "Client", mode: "Google Meet", link: "meet.google.com/fx-tt-002", interviewer: "Hrishab", status: "Scheduled", recruiter: "Abhishek" },
  { id: 3, candidate: "Priya Mehta", job: "Solution Architect - Java", client: "StatusNeo", date: "2026-03-26", time: "11:00 AM", type: "Technical", mode: "Google Meet", link: "meet.google.com/fx-sn-001", interviewer: "Rishabh", status: "Scheduled", recruiter: "Kanchan" },
  { id: 4, candidate: "Sneha Jain", job: "Data Scientist", client: "Shaadi.com", date: "2026-03-26", time: "03:00 PM", type: "HR", mode: "Google Meet", link: "meet.google.com/fx-sh-001", interviewer: "Naazish Butt", status: "Scheduled", recruiter: "Kanchan" },
  { id: 5, candidate: "Kavita Rawat", job: "Product Analyst", client: "BB", date: "2026-03-27", time: "10:30 AM", type: "Technical", mode: "Google Meet", link: "meet.google.com/fx-bb-001", interviewer: "Punith", status: "Scheduled", recruiter: "Kavita" },
  { id: 6, candidate: "Anita Bisht", job: "Zonal Head - ELV", client: "TT", date: "2026-03-27", time: "04:00 PM", type: "Client", mode: "In-Person", link: null, interviewer: "Hrishab", status: "Pending Confirmation", recruiter: "Abhishek" },
];

const WHATSAPP_THREADS = [
  { id: 1, candidate: "Vikash Rawat", phone: "+91 98765 43210", lastMsg: "Hi Vikash, your technical round with TT is confirmed for March 25 at 10 AM via Google Meet. Best of luck!", time: "10:32 AM", unread: 0, status: "read" },
  { id: 2, candidate: "Rajesh Kumar", phone: "+91 98123 45678", lastMsg: "Thanks, I'll join on time.", time: "9:15 AM", unread: 0, status: "read" },
  { id: 3, candidate: "Priya Mehta", phone: "+91 97654 32100", lastMsg: "Could you share the JD for the Solution Architect role at StatusNeo?", time: "Yesterday", unread: 1, status: "delivered" },
  { id: 4, candidate: "Sneha Jain", phone: "+91 96543 21098", lastMsg: "Hi Sneha, your HR round with Shaadi.com is on March 26 at 3 PM. SPOC: Naazish. All the best!", time: "Yesterday", unread: 0, status: "read" },
  { id: 5, candidate: "Ravi Tomar", phone: "+91 95432 10987", lastMsg: "Hi Ravi, TT is preparing your offer at 12 LPA for the Chennai Sr. Service Engineer role. We'll share the letter shortly.", time: "Mar 22", unread: 0, status: "read" },
  { id: 6, candidate: "Anita Bisht", phone: "+91 94321 09876", lastMsg: "Your profile has been submitted to TT for the Zonal Head ELV position. Will update within 48 hours.", time: "Mar 23", unread: 2, status: "delivered" },
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
const CommandCenter = ({ setPage, user, perms }) => {
  const isRecruiter = user?.role === "Recruiter";
  const myName = user?.name || "";
  const myJobs = isRecruiter ? JOBS.filter(j => j.recruiter === myName || j.recruiter === user?.name) : JOBS;
  const myPipeline = isRecruiter ? PIPELINE.filter(p => p.recruiter === myName) : PIPELINE;
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
          <span style={{ fontSize:12, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em" }}>{isRecruiter ? "My Interviews" : "Today's Interviews"}</span>
          <button onClick={()=>setPage("interviews")} style={{ fontSize:11, color:C.accentLight, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>View All →</button>
        </div>
        {(isRecruiter ? INTERVIEWS.filter(i=>i.recruiter===myName) : INTERVIEWS.filter(i=>i.date==="2026-03-25")).map(i => (
          <div key={i.id} style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12.5, color:C.text, fontWeight:600 }}>{i.candidate}</div>
            <div style={{ fontSize:11, color:C.textMuted }}>{i.job} • {i.time}</div>
            <div style={{ display:"flex", gap:6, marginTop:5 }}>
              <Badge text={i.type} color={C.purple} />
              {i.mode==="Google Meet" && <Badge text="G Meet" color={C.green} />}
            </div>
          </div>
        ))}
        {(isRecruiter ? INTERVIEWS.filter(i=>i.recruiter===myName) : INTERVIEWS.filter(i=>i.date==="2026-03-25")).length===0 && <div style={{fontSize:12,color:C.textDim,padding:10}}>No interviews</div>}
      </div>

      {/* My Assigned Positions / Critical Requirements */}
      <div style={{ background:C.card, borderRadius:14, padding:"20px 22px", border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <span style={{ fontSize:12, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em" }}>{isRecruiter ? "My open positions" : "Critical requirements"}</span>
          <button onClick={()=>setPage("jobs")} style={{ fontSize:11, color:C.accentLight, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>View All →</button>
        </div>
        {(isRecruiter ? myJobs.filter(j=>j.status==="Open") : JOBS.filter(j=>j.priority==="Critical"&&j.status==="Open")).map(j => (
          <div key={j.id} style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12.5, color:C.text, fontWeight:600 }}>{j.title}</div>
            <div style={{ fontSize:11, color:C.textMuted }}>{j.client} • {j.location} • {j.positions-j.filled} open</div>
            <div style={{ display:"flex", gap:6, marginTop:5 }}>
              <Badge text={j.priority} color={j.priority==="Critical"?C.red:j.priority==="High"?C.yellow:C.accent} />
              <span style={{ fontSize:10, color:C.textDim }}>{j.ctcRange}</span>
            </div>
          </div>
        ))}
        {(isRecruiter ? myJobs.filter(j=>j.status==="Open") : JOBS.filter(j=>j.priority==="Critical"&&j.status==="Open")).length===0 && <div style={{fontSize:12,color:C.textDim,padding:10}}>No positions assigned</div>}
      </div>

      {/* My Pipeline / WhatsApp */}
      <div style={{ background:C.card, borderRadius:14, padding:"20px 22px", border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <span style={{ fontSize:12, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em" }}>{isRecruiter ? "My pipeline" : "WhatsApp"}</span>
          <button onClick={()=>setPage(isRecruiter?"pipeline":"whatsapp")} style={{ fontSize:11, color:isRecruiter?C.accentLight:C.whatsapp, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>View All →</button>
        </div>
        {isRecruiter ? myPipeline.map(p => (
          <div key={p.id} style={{ padding:"8px 0", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:12, color:C.text, fontWeight:600 }}>{p.candidate}</div>
              <div style={{ fontSize:10.5, color:C.textMuted }}>{p.job} • {p.client}</div>
            </div>
            <Badge text={p.stage.replace(" Round","").replace("Submitted to ","→ ")} color={STAGE_CLR[p.stage]||C.textMuted} />
          </div>
        )) : WHATSAPP_THREADS.slice(0,4).map(t => (
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
        {isRecruiter && myPipeline.length===0 && <div style={{fontSize:12,color:C.textDim,padding:10}}>No candidates in pipeline</div>}
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
const ClientsPage = ({ perms }) => {
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
      {perms?.canEditClients && <Btn icon={Icons.plus}>Add Client</Btn>}
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

// ── CANDIDATES (with CV Upload + Assessment + Status) ─────────────────
const CAND_STATUSES = ["New","Screening","Account Manager Rejected","Submitted to Client","HR Review","Interview Stage","HR Discussion","Offer","Joined","Not Joined"];
const STATUS_CLR = {"New":C.textMuted,"Screening":C.accent,"Account Manager Rejected":C.red,"Submitted to Client":"#6366F1","HR Review":C.purple,"Interview Stage":C.yellow,"HR Discussion":C.pink,"Offer":C.teal,"Joined":C.green,"Not Joined":C.red};

const CandidatesPage = ({ perms, user }) => {
  const [search, setSearch] = useState(""); const [sel, setSel] = useState(null);
  const [statusF, setStatusF] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [candidates, setCandidates] = useState(CANDIDATES);
  const [statusMsg, setStatusMsg] = useState("");

  const f = candidates.filter(c => {
    const m = c.name.toLowerCase().includes(search.toLowerCase()) || c.role.toLowerCase().includes(search.toLowerCase()) || (c.skills||[]).some(s=>s.toLowerCase().includes(search.toLowerCase()));
    return m && (statusF==="All" || c.pipelineStatus===statusF || c.status===statusF);
  });

  const changeStatus = (candidate, newStatus) => {
    setCandidates(prev => prev.map(c => c.id === candidate.id ? {...c, pipelineStatus: newStatus, status: newStatus} : c));
    setSel(prev => prev ? {...prev, pipelineStatus: newStatus, status: newStatus} : prev);
    setStatusMsg(`Status changed to "${newStatus}"`);
    setTimeout(() => setStatusMsg(""), 3000);
    // TODO: call API → updateCandidateStatus(candidate.id, newStatus)
  };

  const addCandidate = (newCand) => {
    const id = `CN${String(candidates.length+1).padStart(4,"0")}`;
    setCandidates(prev => [{...newCand, id, pipelineStatus:"New", status:"New", owner: user?.name, resumeScore: Math.round(((newCand.scoreSoft||0)+(newCand.scoreStability||0)+(newCand.scoreTech||0)+(newCand.scoreExp||0))/4*10)}, ...prev]);
    setShowAdd(false);
  };

  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, gap:10, flexWrap:"wrap" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Name, role, skills..." />
        {["All","New","Screening","Submitted to Client","Interview Stage","Offer","Joined"].map(s => <Pill key={s} text={s.length>15?s.replace("Submitted to ","→ "):s} active={statusF===s} onClick={()=>setStatusF(s)} />)}
      </div>
      {(perms?.canEditCandidates || user?.role==="Account Manager" || user?.role==="Super Admin") && <Btn icon={Icons.plus} onClick={()=>setShowAdd(true)}>Add Candidate + CV</Btn>}
    </div>
    {statusMsg && <div style={{ padding:"10px 16px", borderRadius:8, background:C.green+"18", color:C.green, fontSize:13, fontWeight:600, marginBottom:14 }}>{Icons.check} {statusMsg}</div>}
    <Table columns={[
      { label:"Name", render:r=><span style={{fontWeight:700,color:C.text}}>{r.name}</span> },
      { label:"Role", key:"role" },
      { label:"Exp", key:"experience" },
      { label:"Score", render:r=><span style={{fontWeight:700,color:(r.resumeScore||0)>70?C.green:(r.resumeScore||0)>50?C.yellow:C.red}}>{r.resumeScore||"—"}</span> },
      { label:"CTC (F+V)", render:r=>r.ctcFixed ? `${r.ctcFixed}+${r.ctcVar||0}` : (r.currentCTC||"—") },
      { label:"Expected", render:r=>r.expFixed ? `${r.expFixed}+${r.expVar||0}` : (r.expectedCTC||"—") },
      { label:"Notice", key:"noticePeriod" },
      { label:"Owner", render:r=><span style={{color:C.accent,fontSize:11}}>{r.owner||"—"}</span> },
      { label:"Status", render:r=><Badge text={r.pipelineStatus||r.status||"New"} color={STATUS_CLR[r.pipelineStatus||r.status]||C.textMuted} /> },
    ]} data={f.slice(0,30)} onRow={setSel} />

    {/* ── Candidate Detail + Status Change Modal ── */}
    <Modal open={!!sel} onClose={()=>setSel(null)} title={sel?.name} width={640}>
      {sel && <div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <Field label="Role" value={sel.role} /><Field label="Experience" value={sel.experience} />
          <Field label="Email" value={sel.email} /><Field label="Phone" value={sel.phone} />
          <Field label="Location" value={sel.location} /><Field label="Notice Period" value={sel.noticePeriod} />
          <Field label="Current CTC (Fixed)" value={sel.ctcFixed||sel.currentCTC||"—"} />
          <Field label="Current CTC (Variable)" value={sel.ctcVar||"—"} />
          <Field label="Expected CTC (Fixed)" value={sel.expFixed||sel.expectedCTC||"—"} />
          <Field label="Expected CTC (Variable)" value={sel.expVar||"—"} />
          <Field label="Holding Offer" value={sel.holdingOffer?"Yes — "+sel.holdingOfferDetails:"No"} />
          <Field label="Last Working Day" value={sel.lwd||"—"} />
          <Field label="Source" value={sel.source} /><Field label="Owner" value={sel.owner||"—"} />
          <Field label="Referral By" value={sel.referralName||"None"} />
          <Field label="Referral Phone" value={sel.referralPhone||"—"} />
        </div>
        {(sel.scoreSoft||sel.scoreTech) && <div style={{ marginTop:14, padding:14, borderRadius:10, background:C.surface, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8, fontWeight:600 }}>Assessment scores (1-10)</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, textAlign:"center" }}>
            {[{l:"Soft Skills",v:sel.scoreSoft},{l:"Stability",v:sel.scoreStability},{l:"Technical",v:sel.scoreTech},{l:"Relevant Exp",v:sel.scoreExp}].map(s=>
              <div key={s.l}><div style={{fontSize:22,fontWeight:800,color:(s.v||0)>=7?C.green:(s.v||0)>=5?C.yellow:C.red,fontFamily:F.display}}>{s.v||"—"}</div><div style={{fontSize:10,color:C.textDim}}>{s.l}</div></div>
            )}
          </div>
          {sel.assessmentNotes && <div style={{marginTop:8,fontSize:12,color:C.textMuted,fontStyle:"italic"}}>{sel.assessmentNotes}</div>}
        </div>}

        {/* Status Change */}
        <div style={{ marginTop:16, padding:14, borderRadius:10, background:C.surface, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10, fontWeight:600 }}>Pipeline status</div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <Badge text={sel.pipelineStatus||sel.status||"New"} color={STATUS_CLR[sel.pipelineStatus||sel.status]||C.textMuted} />
          </div>
          {(user?.role==="Recruiter" || user?.role==="Super Admin") && (
            <div>
              <div style={{ fontSize:11, color:C.textMuted, marginBottom:6 }}>Change status:</div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {CAND_STATUSES.filter(s => {
                  if (user?.role==="Recruiter") return s !== "Account Manager Rejected";
                  return true;
                }).map(s => (
                  <button key={s} onClick={()=>changeStatus(sel, s)}
                    style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${(sel.pipelineStatus||sel.status)===s?STATUS_CLR[s]:C.border}`, background:(sel.pipelineStatus||sel.status)===s?(STATUS_CLR[s]||C.accent)+"18":"transparent", color:(sel.pipelineStatus||sel.status)===s?STATUS_CLR[s]:C.textMuted, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F.body }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {user?.role==="Account Manager" && (
            <div>
              <div style={{ fontSize:11, color:C.textMuted, marginBottom:6 }}>Account Manager action:</div>
              <Btn small variant="danger" onClick={()=>changeStatus(sel, "Account Manager Rejected")}>Reject Candidate</Btn>
            </div>
          )}
          {statusMsg && <div style={{ marginTop:8, fontSize:12, color:C.green, fontWeight:600 }}>{statusMsg}</div>}
        </div>

        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <Btn variant="whatsapp" icon={Icons.whatsapp} small>WhatsApp</Btn>
          <Btn variant="secondary" icon={Icons.mail} small>Email</Btn>
          <Btn variant="secondary" icon={Icons.phone} small>Call</Btn>
        </div>
      </div>}
    </Modal>

    {/* ── Add Candidate + CV Upload + Assessment Form ── */}
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Candidate with CV & Assessment" width={680}>
      <AddCandidateForm user={user} onSave={addCandidate} onClose={()=>setShowAdd(false)} />
    </Modal>
  </div>;
};

// ── Add Candidate Form (CV + Assessment + CTC + Referral) ──────────────
const AddCandidateForm = ({ user, onSave, onClose }) => {
  const [v, setV] = useState({});
  const [cvFile, setCvFile] = useState(null);
  const [step, setStep] = useState(1); // 1=basic, 2=CTC+details, 3=assessment
  const [saved, setSaved] = useState(false);
  const set = (k, val) => setV(p => ({...p, [k]: val}));

  const handleSave = () => {
    const cand = {
      name: v.name, email: v.email, phone: v.phone, role: v.role, experience: v.experience,
      location: v.location, source: v.source || "Direct", skills: (v.skills||"").split(",").map(s=>s.trim()).filter(Boolean),
      ctcFixed: v.ctcFixed, ctcVar: v.ctcVar, expFixed: v.expFixed, expVar: v.expVar,
      noticePeriod: v.noticePeriod, lwd: v.lwd, holdingOffer: v.holdingOffer==="Yes",
      holdingOfferDetails: v.holdingOfferDetails, referralName: v.referralName, referralPhone: v.referralPhone,
      scoreSoft: parseInt(v.scoreSoft)||0, scoreStability: parseInt(v.scoreStability)||0,
      scoreTech: parseInt(v.scoreTech)||0, scoreExp: parseInt(v.scoreExp)||0,
      assessmentNotes: v.assessmentNotes, owner: user?.name, cvFile: cvFile?.name,
    };
    onSave(cand);
    setSaved(true);
    // TODO: call API → uploadCandidateWithCV(formData)
  };

  if (saved) return (
    <div style={{ textAlign:"center", padding:30 }}>
      <div style={{ width:48, height:48, borderRadius:24, background:C.green+"20", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16", color:C.green }}>{Icons.check}</div>
      <div style={{ fontSize:16, fontWeight:700, color:C.text, fontFamily:F.display, marginBottom:6 }}>Candidate added!</div>
      <div style={{ fontSize:13, color:C.textMuted }}>CV uploaded. Owner: {user?.name}. Status: New.</div>
    </div>
  );

  const inputStyle = { width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:13, fontFamily:F.body, outline:"none", boxSizing:"border-box" };
  const labelStyle = { display:"block", fontSize:11, color:C.textMuted, marginBottom:4, fontWeight:600 };

  return <div>
    {/* Step indicators */}
    <div style={{ display:"flex", gap:4, marginBottom:20 }}>
      {[{n:1,l:"Basic Info"},{n:2,l:"CTC & Details"},{n:3,l:"Assessment"}].map(s => (
        <button key={s.n} onClick={()=>setStep(s.n)} style={{ flex:1, padding:"8px", borderRadius:8, border:`1px solid ${step===s.n?C.accent:C.border}`, background:step===s.n?C.accentGlow:"transparent", color:step===s.n?C.accent:C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F.body }}>
          {s.n}. {s.l}
        </button>
      ))}
    </div>

    {step===1 && <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div><label style={labelStyle}>Full Name *</label><input value={v.name||""} onChange={e=>set("name",e.target.value)} style={inputStyle} placeholder="Candidate name" /></div>
        <div><label style={labelStyle}>Email</label><input value={v.email||""} onChange={e=>set("email",e.target.value)} style={inputStyle} placeholder="email@example.com" /></div>
        <div><label style={labelStyle}>Phone *</label><input value={v.phone||""} onChange={e=>set("phone",e.target.value)} style={inputStyle} placeholder="+91 98765 43210" /></div>
        <div><label style={labelStyle}>Role / Designation</label><input value={v.role||""} onChange={e=>set("role",e.target.value)} style={inputStyle} placeholder="Java Developer" /></div>
        <div><label style={labelStyle}>Experience</label><input value={v.experience||""} onChange={e=>set("experience",e.target.value)} style={inputStyle} placeholder="5 yrs" /></div>
        <div><label style={labelStyle}>Location</label><input value={v.location||""} onChange={e=>set("location",e.target.value)} style={inputStyle} placeholder="Bangalore" /></div>
        <div><label style={labelStyle}>Skills (comma separated)</label><input value={v.skills||""} onChange={e=>set("skills",e.target.value)} style={inputStyle} placeholder="Java, Spring Boot, AWS" /></div>
        <div><label style={labelStyle}>Source</label>
          <select value={v.source||""} onChange={e=>set("source",e.target.value)} style={inputStyle}>
            <option value="">Select</option>
            {["LinkedIn","Naukri","Indeed","Referral","Direct","Job Fair","Monster"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop:16 }}>
        <label style={labelStyle}>Upload CV (PDF / DOC / DOCX)</label>
        <div style={{ border:`2px dashed ${C.border}`, borderRadius:10, padding:20, textAlign:"center", cursor:"pointer", background:cvFile?C.green+"08":C.surface }}
          onClick={()=>document.getElementById("cv-input").click()}>
          <input id="cv-input" type="file" accept=".pdf,.doc,.docx" style={{display:"none"}} onChange={e=>setCvFile(e.target.files[0])} />
          {cvFile ? <div style={{color:C.green,fontWeight:600,fontSize:13}}>{Icons.check} {cvFile.name} ({(cvFile.size/1024/1024).toFixed(1)} MB)</div>
          : <div style={{color:C.textMuted,fontSize:13}}>Click to select CV file or drag & drop</div>}
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
        <Btn onClick={()=>setStep(2)}>Next → CTC & Details</Btn>
      </div>
    </div>}

    {step===2 && <div>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:12 }}>Compensation details</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div><label style={labelStyle}>Current CTC — Fixed (LPA)</label><input value={v.ctcFixed||""} onChange={e=>set("ctcFixed",e.target.value)} style={inputStyle} placeholder="12" /></div>
        <div><label style={labelStyle}>Current CTC — Variable (LPA)</label><input value={v.ctcVar||""} onChange={e=>set("ctcVar",e.target.value)} style={inputStyle} placeholder="2" /></div>
        <div><label style={labelStyle}>Expected CTC — Fixed (LPA)</label><input value={v.expFixed||""} onChange={e=>set("expFixed",e.target.value)} style={inputStyle} placeholder="18" /></div>
        <div><label style={labelStyle}>Expected CTC — Variable (LPA)</label><input value={v.expVar||""} onChange={e=>set("expVar",e.target.value)} style={inputStyle} placeholder="3" /></div>
        <div><label style={labelStyle}>Notice Period</label>
          <select value={v.noticePeriod||""} onChange={e=>set("noticePeriod",e.target.value)} style={inputStyle}>
            <option value="">Select</option>
            {["Immediate","15 days","30 days","45 days","60 days","90 days"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>Last Working Day</label><input type="date" value={v.lwd||""} onChange={e=>set("lwd",e.target.value)} style={inputStyle} /></div>
        <div><label style={labelStyle}>Holding Any Offer?</label>
          <select value={v.holdingOffer||""} onChange={e=>set("holdingOffer",e.target.value)} style={inputStyle}>
            <option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option>
          </select>
        </div>
        {v.holdingOffer==="Yes" && <div><label style={labelStyle}>Offer Details</label><input value={v.holdingOfferDetails||""} onChange={e=>set("holdingOfferDetails",e.target.value)} style={inputStyle} placeholder="Company, CTC offered" /></div>}
      </div>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginTop:16, marginBottom:12 }}>Referral details (if any)</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div><label style={labelStyle}>Referral Given By (name)</label><input value={v.referralName||""} onChange={e=>set("referralName",e.target.value)} style={inputStyle} placeholder="Referrer name" /></div>
        <div><label style={labelStyle}>Referral Phone</label><input value={v.referralPhone||""} onChange={e=>set("referralPhone",e.target.value)} style={inputStyle} placeholder="+91 98765 43210" /></div>
      </div>
      <div style={{ fontSize:11, color:C.textDim, marginTop:6 }}>If referral candidate joins, referrer is eligible for referral bonus.</div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:16 }}>
        <Btn variant="secondary" onClick={()=>setStep(1)}>← Back</Btn>
        <Btn onClick={()=>setStep(3)}>Next → Assessment</Btn>
      </div>
    </div>}

    {step===3 && <div>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:12 }}>Your assessment of this candidate (rate 1-10)</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {[{k:"scoreSoft",l:"Soft Skills"},{k:"scoreStability",l:"Stability (tenure, loyalty)"},{k:"scoreTech",l:"Technical Knowledge"},{k:"scoreExp",l:"Relevant Experience"}].map(s => (
          <div key={s.k}>
            <label style={labelStyle}>{s.l}</label>
            <div style={{ display:"flex", gap:4 }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={()=>set(s.k, String(n))}
                  style={{ width:28, height:28, borderRadius:6, border:`1px solid ${parseInt(v[s.k])===n?C.accent:C.border}`, background:parseInt(v[s.k])>=n?(n>=8?C.green:n>=5?C.yellow:C.red)+"25":"transparent", color:parseInt(v[s.k])===n?C.accent:C.textMuted, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:12 }}>
        <label style={labelStyle}>Assessment Notes</label>
        <textarea value={v.assessmentNotes||""} onChange={e=>set("assessmentNotes",e.target.value)} rows={3}
          style={{ ...inputStyle, resize:"vertical" }} placeholder="Overall impression, strengths, concerns..." />
      </div>
      <div style={{ marginTop:12, padding:12, borderRadius:8, background:C.surface, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:11, color:C.textDim, marginBottom:4 }}>Overall Score</div>
        <div style={{ fontSize:28, fontWeight:800, fontFamily:F.display, color:C.accent }}>
          {[v.scoreSoft,v.scoreStability,v.scoreTech,v.scoreExp].filter(Boolean).length > 0
            ? Math.round([v.scoreSoft,v.scoreStability,v.scoreTech,v.scoreExp].filter(Boolean).reduce((a,b)=>a+parseInt(b),0) / [v.scoreSoft,v.scoreStability,v.scoreTech,v.scoreExp].filter(Boolean).length * 10)
            : "—"}
          <span style={{ fontSize:14, color:C.textDim }}>/100</span>
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:16 }}>
        <Btn variant="secondary" onClick={()=>setStep(2)}>← Back</Btn>
        <Btn variant="success" icon={Icons.check} onClick={handleSave}>Save Candidate</Btn>
      </div>
    </div>}
  </div>;
};

// ── JOBS ────────────────────────────────────────────────────────────────
const JobsPage = ({ user, perms }) => {
  const [search, setSearch] = useState(""); const [sel, setSel] = useState(null);
  const [statusF, setStatusF] = useState("Open");
  const [jobsData, setJobsData] = useState(JOBS);
  const [assignSuccess, setAssignSuccess] = useState("");
  const [viewAll, setViewAll] = useState(user?.role === "Super Admin" || user?.role === "Account Manager");
  const isRecruiter = user?.role === "Recruiter";
  const canAssign = user?.role === "Super Admin" || user?.role === "Account Manager";
  const allJobs = isRecruiter && !viewAll ? jobsData.filter(j => j.recruiter === user?.name) : jobsData;
  const f = allJobs.filter(j => {
    const m = j.title.toLowerCase().includes(search.toLowerCase()) || j.client.toLowerCase().includes(search.toLowerCase());
    return m && (statusF==="All" || j.status===statusF);
  });

  const assignRecruiter = (jobId, recruiterName) => {
    setJobsData(prev => prev.map(j => j.id === jobId ? { ...j, recruiter: recruiterName } : j));
    setSel(prev => prev ? { ...prev, recruiter: recruiterName } : prev);
    setAssignSuccess(`Assigned to ${recruiterName}`);
    setTimeout(() => setAssignSuccess(""), 3000);
  };

  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, gap:10, flexWrap:"wrap" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Job or client..." />
        {["All","Open","On Hold","Closed"].map(s => <Pill key={s} text={s} active={statusF===s} onClick={()=>setStatusF(s)} />)}
        {isRecruiter && <Pill text={viewAll ? "All positions" : "My positions"} active={!viewAll} onClick={()=>setViewAll(p=>!p)} />}
      </div>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        {isRecruiter && <span style={{ fontSize:12, color:C.textMuted }}>{f.length} position{f.length!==1?"s":""} assigned</span>}
        {perms?.canEditJobs && <Btn icon={Icons.plus}>Add Requirement</Btn>}
      </div>
    </div>
    {assignSuccess && <div style={{ padding:"10px 16px", borderRadius:8, background:C.green+"18", color:C.green, fontSize:13, fontWeight:600, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>{Icons.check} {assignSuccess}</div>}
    <Table columns={[
      { label:"ID", render:r=><span style={{color:C.textDim,fontSize:11}}>{r.id}</span> },
      { label:"Title", render:r=><span style={{fontWeight:700,color:C.text}}>{r.title}</span> },
      { label:"Client", key:"client" },
      { label:"CTC", key:"ctcRange" },
      { label:"Positions", render:r=><span>{r.filled}<span style={{color:C.textDim}}>/{r.positions}</span></span> },
      { label:"Submitted", key:"submitted" },
      { label:"Shortlisted", key:"shortlisted" },
      { label:"Recruiter", render:r=><span style={{color:r.recruiter?C.accent:C.red,fontWeight:600}}>{r.recruiter||"Unassigned"}</span> },
      { label:"Priority", render:r=><Badge text={r.priority} color={r.priority==="Critical"?C.red:r.priority==="High"?C.yellow:C.accent} /> },
      { label:"Deadline", key:"deadline" },
    ]} data={f} onRow={setSel} />
    <Modal open={!!sel} onClose={()=>{setSel(null);setAssignSuccess("");}} title={sel?.title} width={580}>
      {sel && <div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <Field label="Job ID" value={sel.id} /><Field label="Client" value={sel.client} />
          <Field label="Location" value={sel.location} /><Field label="Type" value={sel.type} />
          <Field label="CTC Range" value={sel.ctcRange} /><Field label="Positions" value={`${sel.filled}/${sel.positions}`} />
          <Field label="Submitted" value={sel.submitted} /><Field label="Shortlisted" value={sel.shortlisted} />
          <Field label="Priority" value={sel.priority} /><Field label="Deadline" value={sel.deadline} />
          <Field label="Posted" value={sel.postedDate} /><Field label="Status" value={sel.status} />
        </div>
        <div style={{ gridColumn:"1/-1", marginTop:8 }}>
          <div style={{ fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5, fontWeight:600 }}>Required Skills</div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{sel.skills.map(s => <span key={s} style={{ fontSize:12, padding:"4px 12px", borderRadius:14, background:C.accentGlow, color:C.accentLight }}>{s}</span>)}</div>
        </div>
        {sel.description && <div style={{ marginTop:12 }}><Field label="Notes" value={sel.description} /></div>}

        {/* Assign Recruiter Section */}
        <div style={{ marginTop:16, padding:16, borderRadius:12, background:C.surface, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10, fontWeight:600 }}>Assigned recruiter</div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:canAssign?12:0 }}>
            <div style={{ width:36, height:36, borderRadius:18, background:C.accent+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:C.accent }}>{sel.recruiter?sel.recruiter[0]:"?"}</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{sel.recruiter || "Unassigned"}</div>
              <div style={{ fontSize:11, color:C.textMuted }}>{TEAM.find(t=>t.name===sel.recruiter)?.role || ""}</div>
            </div>
          </div>
          {canAssign && <>
            <div style={{ fontSize:11, color:C.textMuted, marginBottom:8, fontWeight:600 }}>Reassign to:</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {TEAM.map(t => (
                <button key={t.id} onClick={()=>assignRecruiter(sel.id, t.name)}
                  style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${sel.recruiter===t.name?C.accent:C.border}`, background:sel.recruiter===t.name?C.accentGlow:"transparent", color:sel.recruiter===t.name?C.accent:C.text, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F.body, display:"flex", alignItems:"center", gap:6, transition:"all .15s" }}>
                  <span style={{ width:22, height:22, borderRadius:11, background:t.color+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:t.color }}>{t.avatar}</span>
                  {t.name}
                  <span style={{ fontSize:10, color:C.textDim }}>({t.role})</span>
                </button>
              ))}
            </div>
            {assignSuccess && <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, background:C.green+"18", color:C.green, fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>{Icons.check} {assignSuccess}</div>}
          </>}
        </div>
      </div>}
    </Modal>
  </div>;
};

// ── PIPELINE KANBAN ────────────────────────────────────────────────────
const PipelinePage = ({ user, perms }) => {
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
const InterviewsPage = ({ user, perms }) => {
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
// AUTH & ROLES
// ════════════════════════════════════════════════════════════════════════

const USERS = [
  { email: "kanchan.singh@fxconsulting.in", password: "Kanchan@FX2026", name: "Kanchan", role: "Super Admin", avatar: "KS", color: "#3B82F6" },
  { email: "kavita.kaushik@fxconsulting.in", password: "Kavita@FX2026", name: "Kavita", role: "Account Manager", avatar: "KK", color: "#8B5CF6" },
  { email: "abhishek@fxconsulting.in", password: "Abhishek@FX2026", name: "Abhishek", role: "Account Manager", avatar: "AJ", color: "#EC4899" },
  { email: "radhika@fxconsulting.in", password: "Radhika@FX2026", name: "Radhika", role: "Account Manager", avatar: "RP", color: "#F59E0B" },
  { email: "neha@fxconsulting.in", password: "Neha@FX2026", name: "Neha", role: "Account Manager", avatar: "NB", color: "#14B8A6" },
  { email: "g.saurabh@fxconsulting.in", password: "Saurabh@FX2026", name: "Saurabh", role: "Recruiter", avatar: "SG", color: "#10B981" },
  { email: "karan@fxconsulting.in", password: "Karan@FX2026", name: "Karan", role: "Recruiter", avatar: "KN", color: "#6366F1" },
  { email: "bhumika@fxconsulting.in", password: "Bhumika@FX2026", name: "Bhumika", role: "Account Manager", avatar: "BD", color: "#D946EF" },
  { email: "jyoti@fxconsulting.in", password: "Jyoti@FX2026", name: "Jyoti", role: "Recruiter", avatar: "JA", color: "#F97316" },
  { email: "priya@fxconsulting.in", password: "Priya@FX2026", name: "Priya C", role: "Recruiter", avatar: "PC", color: "#EF4444" },
];

// Permissions: which roles can access which modules and actions
const PERMISSIONS = {
  "Super Admin": {
    pages: ["dashboard","cv","clients","candidates","jobs","pipeline","interviews","whatsapp","sourcing","team","reports"],
    canEditClients: true, canEditJobs: true, canEditCandidates: true, canEditPipeline: true,
    canScheduleInterviews: true, canSendWhatsApp: true, canViewTeam: true, canViewReports: true,
    canAddUsers: true, canDeleteAnything: true,
  },
  "Account Manager": {
    pages: ["dashboard","cv","clients","jobs","pipeline","interviews","candidates","whatsapp","team","reports"],
    canEditClients: true, canEditJobs: true, canEditCandidates: true, canEditPipeline: true,
    canScheduleInterviews: true, canSendWhatsApp: true, canViewTeam: true, canViewReports: true,
    canAddUsers: false, canDeleteAnything: false,
  },
  "Recruiter": {
    pages: ["dashboard","cv","candidates","jobs","pipeline","interviews","whatsapp","sourcing"],
    canEditClients: false, canEditJobs: false, canEditCandidates: true, canEditPipeline: true,
    canScheduleInterviews: true, canSendWhatsApp: true, canViewTeam: false, canViewReports: false,
    canAddUsers: false, canDeleteAnything: false,
  },
};

// ── Login Page ─────────────────────────────────────────────────────────
const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleLogin = () => {
    const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === pass);
    if (user) { setError(""); onLogin(user); }
    else setError("Invalid email or password");
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body }}>
      <link href="https://fonts.googleapis.com/css2?family=Satoshi:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <link href="https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap" rel="stylesheet" />
      <div style={{ width:400, padding:40, background:C.card, borderRadius:20, border:`1px solid ${C.border}`, boxShadow:"0 24px 80px rgba(0,0,0,.4)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:56, height:56, borderRadius:14, background:`linear-gradient(135deg, ${C.accent}, #1E40AF)`, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:900, color:"#fff", fontFamily:F.display, marginBottom:16 }}>FX</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.text, fontFamily:F.display, letterSpacing:"-0.02em" }}>FX Consulting</div>
          <div style={{ fontSize:12, color:C.textDim, marginTop:4 }}>Recruitment CRM — fxconsulting.in</div>
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:12, color:C.textMuted, marginBottom:6, fontWeight:600 }}>Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@fxconsulting.in" onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:14, fontFamily:F.body, outline:"none", boxSizing:"border-box" }}
            onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={{ display:"block", fontSize:12, color:C.textMuted, marginBottom:6, fontWeight:600 }}>Password</label>
          <div style={{ position:"relative" }}>
            <input value={pass} onChange={e=>setPass(e.target.value)} type={showPass?"text":"password"} placeholder="Enter password" onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              style={{ width:"100%", padding:"12px 40px 12px 14px", borderRadius:10, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:14, fontFamily:F.body, outline:"none", boxSizing:"border-box" }}
              onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
            <button onClick={()=>setShowPass(p=>!p)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:12 }}>{showPass?"Hide":"Show"}</button>
          </div>
        </div>

        {error && <div style={{ padding:"10px 14px", borderRadius:8, background:C.red+"15", color:C.red, fontSize:13, marginBottom:16, fontWeight:500 }}>{error}</div>}

        <button onClick={handleLogin}
          style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F.body, transition:"opacity .15s" }}
          onMouseEnter={e=>e.target.style.opacity=0.9} onMouseLeave={e=>e.target.style.opacity=1}>
          Sign In
        </button>

        <div style={{ marginTop:24, padding:16, borderRadius:10, background:C.surface, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:11, color:C.textDim, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Role access</div>
          <div style={{ fontSize:12, color:C.textMuted, lineHeight:1.6 }}>
            <span style={{ color:C.accent, fontWeight:600 }}>Super Admin</span> — Full access to everything<br/>
            <span style={{ color:C.purple, fontWeight:600 }}>Account Manager</span> — Clients, requirements, pipeline<br/>
            <span style={{ color:C.green, fontWeight:600 }}>Recruiter</span> — CVs, candidates, interviews, pipeline
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Role Badge for header ──────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const colors = { "Super Admin": C.accent, "Account Manager": C.purple, "Recruiter": C.green };
  return <span style={{ padding:"4px 10px", borderRadius:12, fontSize:10, fontWeight:700, background:(colors[role]||C.textMuted)+"18", color:colors[role]||C.textMuted, textTransform:"uppercase", letterSpacing:"0.04em" }}>{role}</span>;
};

// ── No Access Page ─────────────────────────────────────────────────────
const NoAccess = () => (
  <div style={{ textAlign:"center", padding:60 }}>
    <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
    <div style={{ fontSize:18, fontWeight:700, color:C.text, fontFamily:F.display, marginBottom:8 }}>Access restricted</div>
    <div style={{ fontSize:14, color:C.textMuted }}>Your role doesn't have permission to view this page. Contact your admin.</div>
  </div>
);

// ════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ════════════════════════════════════════════════════════════════════════

const ALL_NAV = [
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
  const [user, setUser] = useState(() => {
    try { const s = localStorage.getItem("fx_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => { const t = setInterval(()=>setTime(new Date()), 60000); return ()=>clearInterval(t); }, []);

  const handleLogin = (u) => { setUser(u); localStorage.setItem("fx_user", JSON.stringify(u)); };
  const handleLogout = () => { setUser(null); localStorage.removeItem("fx_user"); setPage("dashboard"); };

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const perms = PERMISSIONS[user.role] || PERMISSIONS["Recruiter"];
  const NAV = ALL_NAV.filter(n => perms.pages.includes(n.id));
  const pageTitle = ALL_NAV.find(n=>n.id===page)?.label || "Command Center";
  const unreadWA = WHATSAPP_THREADS.reduce((s,t)=>s+t.unread, 0);
  const canView = perms.pages.includes(page);

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

        {/* User info + Logout */}
        <div style={{ borderTop:`1px solid ${C.border}`, padding:collapsed?"10px 6px":"12px 14px" }}>
          {!collapsed && (
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <div style={{ width:32, height:32, borderRadius:16, background:user.color+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:user.color, flexShrink:0 }}>{user.avatar}</div>
              <div style={{ overflow:"hidden" }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{user.name}</div>
                <RoleBadge role={user.role} />
              </div>
            </div>
          )}
          <button onClick={handleLogout} style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.red, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F.body, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            {collapsed ? Icons.x : "Sign Out"}
          </button>
        </div>

        {/* Collapse */}
        <button onClick={()=>setCollapsed(p=>!p)} style={{ padding:10, border:"none", background:"none", color:C.textDim, cursor:"pointer", borderTop:`1px solid ${C.border}`, display:"flex", justifyContent:"center" }}>
          <span style={{ transform:collapsed?"rotate(0deg)":"rotate(180deg)", transition:"transform .2s", display:"flex" }}>{Icons.chevR}</span>
        </button>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Header */}
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 26px", borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.surface }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:C.text, margin:0, fontFamily:F.display, letterSpacing:"-0.02em" }}>{pageTitle}</h1>
            <div style={{ fontSize:10.5, color:C.textDim, marginTop:2, fontWeight:500 }}>{time.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <RoleBadge role={user.role} />
            <div style={{ padding:"7px 14px", borderRadius:8, background:C.greenGlow, display:"flex", alignItems:"center", gap:6, fontSize:11, color:C.green, fontWeight:700 }}>
              <div style={{ width:6, height:6, borderRadius:3, background:C.green, animation:"pulse 2s infinite" }}/>
              Live
            </div>
            <div style={{ position:"relative", cursor:"pointer", color:C.textMuted }}>{Icons.bell}<div style={{ position:"absolute", top:-2, right:-2, width:7, height:7, borderRadius:4, background:C.red }}/></div>
            <div style={{ width:34, height:34, borderRadius:17, background:user.color+"25", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:user.color, fontFamily:F.display }}>{user.avatar}</div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex:1, overflow:"auto", padding:"22px 26px" }}>
          {!canView ? <NoAccess /> : <>
            {page==="dashboard" && <CommandCenter setPage={setPage} user={user} perms={perms} />}
            {page==="cv" && <CVHub />}
            {page==="clients" && <ClientsPage perms={perms} />}
            {page==="candidates" && <CandidatesPage perms={perms} user={user} />}
            {page==="jobs" && <JobsPage user={user} perms={perms} />}
            {page==="pipeline" && <PipelinePage user={user} perms={perms} />}
            {page==="interviews" && <InterviewsPage user={user} perms={perms} />}
            {page==="whatsapp" && <WhatsAppPage />}
            {page==="sourcing" && <SourcingPage />}
            {page==="team" && <TeamPage />}
            {page==="reports" && <ReportsPage />}
          </>}
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
