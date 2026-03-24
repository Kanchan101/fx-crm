-- ═══════════════════════════════════════════════════════
-- FX CONSULTING CRM — SEED DATA
-- Run this AFTER schema.sql in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- TEAM (passwords are bcrypt hash of "fx2026")
INSERT INTO team (name, email, password_hash, role, phone, avatar_color, revenue_target) VALUES
('Kanchann', 'kanchann@fxconsulting.in', '$2b$10$xJ5Zq8K9vR3hN7wY2mA5aeQX1jF6kD4pL8sT0cI2uG9yW3bE1nO6', 'Co-Founder', '+91 98765 00001', '#3B82F6', 5000000),
('Kavita', 'kavita@fxconsulting.in', '$2b$10$xJ5Zq8K9vR3hN7wY2mA5aeQX1jF6kD4pL8sT0cI2uG9yW3bE1nO6', 'Co-Founder', '+91 98765 00002', '#8B5CF6', 5000000),
('Ritu', 'ritu@fxconsulting.in', '$2b$10$xJ5Zq8K9vR3hN7wY2mA5aeQX1jF6kD4pL8sT0cI2uG9yW3bE1nO6', 'Sr. Recruiter', '+91 98765 00003', '#EC4899', 2500000),
('Priya', 'priya@fxconsulting.in', '$2b$10$xJ5Zq8K9vR3hN7wY2mA5aeQX1jF6kD4pL8sT0cI2uG9yW3bE1nO6', 'Recruiter', '+91 98765 00004', '#F59E0B', 2000000),
('Ankit', 'ankit@fxconsulting.in', '$2b$10$xJ5Zq8K9vR3hN7wY2mA5aeQX1jF6kD4pL8sT0cI2uG9yW3bE1nO6', 'Jr. Recruiter', '+91 98765 00005', '#14B8A6', 1000000);

-- CLIENTS
INSERT INTO clients (company_name, industry, tier, poc_name, poc_role, email, phone, location, status, contract_end, payment_terms, fee_percent) VALUES
('Infosys BPM', 'IT Services', 'Platinum', 'Rajesh Mehta', 'TA Head', 'rajesh.m@infosys.com', '+91 98765 43210', 'Bangalore', 'Active', '2027-03-31', 'Net 30', 8.33),
('Wipro Technologies', 'IT Services', 'Gold', 'Anita Sharma', 'HR Director', 'anita.s@wipro.com', '+91 98123 45678', 'Pune', 'Active', '2026-12-31', 'Net 45', 8.33),
('Tata Motors', 'Automotive', 'Gold', 'Vikram Singh', 'VP HR', 'vikram.s@tatamotors.com', '+91 99887 65432', 'Mumbai', 'Active', '2026-09-30', 'Net 30', 10),
('HCL Technologies', 'IT Services', 'Platinum', 'Priya Nair', 'Recruitment Lead', 'priya.n@hcl.com', '+91 97654 32100', 'Noida', 'Active', '2027-06-30', 'Net 30', 8.33),
('Reliance Jio', 'Telecom', 'Silver', 'Arjun Patel', 'Sr. HRBP', 'arjun.p@jio.com', '+91 96543 21098', 'Mumbai', 'Dormant', '2026-06-30', 'Net 60', 8.33),
('Tech Mahindra', 'IT Services', 'Gold', 'Sunita Reddy', 'TA Manager', 'sunita.r@techmahindra.com', '+91 94321 09876', 'Hyderabad', 'Active', '2027-01-31', 'Net 30', 8.33),
('Bajaj Finance', 'BFSI', 'Silver', 'Manoj Gupta', 'CHRO', 'manoj.g@bajajfinance.com', '+91 93210 98765', 'Pune', 'Active', '2026-12-31', 'Net 45', 10),
('L&T Infotech', 'IT Services', 'Gold', 'Kavitha Mohan', 'AVP Talent', 'kavitha.m@ltimindtree.com', '+91 92109 87654', 'Mumbai', 'Active', '2027-03-31', 'Net 30', 8.33),
('Mahindra & Mahindra', 'Automotive', 'Silver', 'Deepak Kulkarni', 'Group HR', 'deepak.k@mahindra.com', '+91 95432 10987', 'Mumbai', 'Active', '2026-09-30', 'Net 30', 10),
('HDFC Bank', 'BFSI', 'Platinum', 'Ramesh Iyer', 'Head Recruitment', 'ramesh.i@hdfcbank.com', '+91 91098 76543', 'Mumbai', 'Active', '2027-06-30', 'Net 30', 8.33);

-- CANDIDATES (30 candidates)
INSERT INTO candidates (name, email, phone, role, experience, skills, location, current_ctc, expected_ctc, notice_period, source, resume_score, status, whatsapp_opted, naukri_id, linkedin_url) VALUES
('Amit Kumar', 'amit.k@gmail.com', '+91 87654 32109', 'Java Developer', '5 yrs', ARRAY['Java','Spring Boot','AWS'], 'Bangalore', '12 LPA', '18 LPA', '30 days', 'LinkedIn', 82, 'In Pipeline', true, NULL, 'linkedin.com/in/amit-kumar'),
('Sneha Iyer', 'sneha.i@gmail.com', '+91 86543 21098', 'Data Analyst', '3 yrs', ARRAY['Python','SQL','Tableau'], 'Hyderabad', '8 LPA', '12 LPA', '60 days', 'Naukri', 74, 'In Pipeline', true, 'NK100001', NULL),
('Rahul Verma', 'rahul.v@gmail.com', '+91 85432 10987', 'DevOps Engineer', '7 yrs', ARRAY['Docker','Kubernetes','Jenkins'], 'Pune', '18 LPA', '25 LPA', '90 days', 'Referral', 91, 'Placed', false, NULL, 'linkedin.com/in/rahul-verma'),
('Priyanka Das', 'priyanka.d@gmail.com', '+91 84321 09876', 'UI/UX Designer', '4 yrs', ARRAY['Figma','React','CSS'], 'Mumbai', '10 LPA', '15 LPA', '30 days', 'LinkedIn', 70, 'In Pipeline', true, NULL, 'linkedin.com/in/priyanka-das'),
('Karthik Rajan', 'karthik.r@gmail.com', '+91 83210 98765', 'SAP Consultant', '8 yrs', ARRAY['SAP FICO','S/4HANA','ABAP'], 'Chennai', '22 LPA', '30 LPA', '90 days', 'Naukri', 78, 'In Pipeline', true, 'NK100003', NULL),
('Neha Gupta', 'neha.g@gmail.com', '+91 82109 87654', 'Product Manager', '6 yrs', ARRAY['Agile','Jira','SQL'], 'Noida', '20 LPA', '28 LPA', '60 days', 'LinkedIn', 85, 'Offered', true, NULL, 'linkedin.com/in/neha-gupta'),
('Siddharth Joshi', 'siddharth.j@gmail.com', '+91 81098 76543', 'Cloud Architect', '10 yrs', ARRAY['AWS','Azure','Terraform'], 'Bangalore', '35 LPA', '45 LPA', '90 days', 'Referral', 95, 'Placed', false, NULL, 'linkedin.com/in/siddharth-joshi'),
('Meera Nair', 'meera.n@gmail.com', '+91 80987 65432', 'HR Manager', '5 yrs', ARRAY['HRIS','Compliance','L&D'], 'Kochi', '14 LPA', '20 LPA', '30 days', 'Indeed', 55, 'Active', true, NULL, NULL),
('Arjun Menon', 'arjun.m@gmail.com', '+91 79876 54321', 'Full Stack Dev', '4 yrs', ARRAY['React','Node.js','MongoDB'], 'Bangalore', '11 LPA', '16 LPA', '30 days', 'LinkedIn', 68, 'In Pipeline', true, NULL, 'linkedin.com/in/arjun-menon'),
('Divya Sharma', 'divya.s@gmail.com', '+91 78765 43210', 'QA Lead', '6 yrs', ARRAY['Selenium','API Testing','Agile'], 'Pune', '16 LPA', '22 LPA', '60 days', 'Naukri', 72, 'In Pipeline', false, 'NK100005', NULL),
('Rohit Tiwari', 'rohit.t@gmail.com', '+91 77654 32109', 'Python Developer', '3 yrs', ARRAY['Python','Django','PostgreSQL'], 'Mumbai', '9 LPA', '14 LPA', 'Immediate', 'LinkedIn', 76, 'Active', true, NULL, 'linkedin.com/in/rohit-tiwari'),
('Anjali Mishra', 'anjali.m@gmail.com', '+91 76543 21098', 'ML Engineer', '4 yrs', ARRAY['PyTorch','NLP','MLOps'], 'Bangalore', '15 LPA', '22 LPA', '30 days', 'Naukri', 80, 'In Pipeline', true, 'NK100006', NULL),
('Varun Kapoor', 'varun.k@gmail.com', '+91 75432 10987', 'Scrum Master', '5 yrs', ARRAY['Agile','Kanban','Confluence'], 'Gurgaon', '18 LPA', '24 LPA', '60 days', 'Referral', 65, 'Active', false, NULL, NULL),
('Pooja Reddy', 'pooja.r@gmail.com', '+91 74321 09876', 'Business Analyst', '4 yrs', ARRAY['Tableau','Power BI','SQL'], 'Hyderabad', '12 LPA', '18 LPA', '30 days', 'LinkedIn', 71, 'In Pipeline', true, NULL, 'linkedin.com/in/pooja-reddy'),
('Manish Saxena', 'manish.s@gmail.com', '+91 73210 98765', 'SAP Consultant', '8 yrs', ARRAY['SAP FICO','S/4HANA','ABAP'], 'Pune', '24 LPA', '32 LPA', '90 days', 'Naukri', 62, 'Active', true, 'NK100008', NULL),
('Ritu Agarwal', 'ritu.a@gmail.com', '+91 72109 87654', 'iOS Developer', '5 yrs', ARRAY['Swift','Xcode','Firebase'], 'Noida', '16 LPA', '22 LPA', '30 days', 'LinkedIn', 73, 'Active', true, NULL, 'linkedin.com/in/ritu-agarwal'),
('Sandeep Yadav', 'sandeep.y@gmail.com', '+91 71098 76543', 'Android Developer', '4 yrs', ARRAY['Kotlin','Jetpack','Firebase'], 'Bangalore', '14 LPA', '20 LPA', '60 days', 'Naukri', 69, 'Active', false, 'NK100009', NULL),
('Swati Deshmukh', 'swati.d@gmail.com', '+91 70987 65432', 'Data Engineer', '6 yrs', ARRAY['Spark','Airflow','Snowflake'], 'Pune', '20 LPA', '28 LPA', '30 days', 'Referral', 84, 'Active', true, NULL, NULL),
('Nitin Patil', 'nitin.p@gmail.com', '+91 69876 54321', 'SRE', '5 yrs', ARRAY['Linux','Prometheus','Grafana'], 'Mumbai', '18 LPA', '24 LPA', '60 days', 'LinkedIn', 77, 'Active', true, NULL, 'linkedin.com/in/nitin-patil'),
('Kavya Srinivasan', 'kavya.s@gmail.com', '+91 68765 43210', 'React Developer', '3 yrs', ARRAY['React','TypeScript','GraphQL'], 'Chennai', '10 LPA', '16 LPA', '30 days', 'Naukri', 77, 'In Pipeline', true, 'NK100010', NULL);

-- JOBS
INSERT INTO jobs (title, client_id, location, job_type, ctc_min, ctc_max, positions, filled, submitted, shortlisted, skills_required, priority, status, recruiter_id, posted_date, deadline) VALUES
('Senior Java Developer', 1, 'Bangalore', 'Permanent', 18, 25, 4, 1, 12, 5, ARRAY['Java','Spring Boot','Microservices'], 'Critical', 'Open', 2, '2026-02-15', '2026-04-15'),
('Data Scientist', 2, 'Pune', 'Permanent', 20, 30, 2, 0, 8, 3, ARRAY['Python','ML','TensorFlow'], 'Critical', 'Open', 1, '2026-03-01', '2026-04-01'),
('DevOps Lead', 4, 'Noida', 'Permanent', 25, 35, 1, 1, 6, 2, ARRAY['AWS','Docker','Kubernetes'], 'High', 'Closed', 2, '2026-01-10', '2026-03-10'),
('SAP FICO Consultant', 3, 'Mumbai', 'Contract', 30, 40, 3, 0, 10, 4, ARRAY['SAP FICO','S/4HANA'], 'High', 'Open', 3, '2026-03-05', '2026-05-05'),
('Full Stack Developer', 7, 'Pune', 'Permanent', 14, 22, 5, 2, 20, 8, ARRAY['React','Node.js','MongoDB'], 'High', 'Open', 4, '2026-02-28', '2026-04-28'),
('Cloud Architect', 6, 'Hyderabad', 'Permanent', 35, 50, 1, 1, 4, 2, ARRAY['AWS','Azure','GCP'], 'Critical', 'Closed', 1, '2026-01-20', '2026-03-20'),
('Product Manager', 4, 'Noida', 'Permanent', 25, 35, 3, 0, 14, 6, ARRAY['Agile','Data Analytics','B2B SaaS'], 'High', 'Open', 2, '2026-03-12', '2026-04-30'),
('QA Automation Lead', 8, 'Mumbai', 'Permanent', 18, 25, 2, 0, 9, 3, ARRAY['Selenium','Cypress','CI/CD'], 'Medium', 'Open', 3, '2026-03-15', '2026-05-15'),
('React Developer', 10, 'Mumbai', 'Permanent', 14, 20, 6, 1, 25, 10, ARRAY['React','TypeScript','Node.js'], 'Critical', 'Open', 4, '2026-03-01', '2026-04-15'),
('ML Engineer', 1, 'Bangalore', 'Permanent', 22, 32, 2, 0, 7, 2, ARRAY['PyTorch','NLP','MLOps'], 'High', 'Open', 1, '2026-03-18', '2026-05-18');

-- PIPELINE
INSERT INTO pipeline (candidate_id, job_id, stage, score, recruiter_id, notes) VALUES
(1, 1, 'Technical Round', 82, 2, 'Strong Spring Boot, client liked profile'),
(2, 2, 'Screening', 74, 1, 'Good ML background, needs TF assessment'),
(3, 3, 'Joined', 91, 2, 'Joined March 15, confirmed'),
(4, 5, 'Submitted to Client', 70, 4, 'Profile shared, awaiting feedback'),
(5, 4, 'Client Interview', 78, 3, 'Interview March 25'),
(6, 7, 'Offer Negotiation', 85, 2, 'HR cleared, offer 28 LPA'),
(7, 6, 'Joined', 95, 1, 'Joined March 1'),
(10, 8, 'Technical Round', 72, 3, 'Tech assessment in progress'),
(9, 9, 'Screening', 68, 4, 'Resume shortlisted'),
(8, 9, 'Sourced', 55, 4, 'Profile identified'),
(11, 10, 'Submitted to Client', 76, 1, 'Strong PyTorch skills'),
(12, 1, 'HR Round', 80, 2, 'Cleared tech, HR scheduled'),
(15, 4, 'Sourced', 62, 3, '8 yrs SAP exp'),
(14, 2, 'Submitted to Client', 71, 1, 'Profile shared'),
(20, 9, 'Client Interview', 77, 4, 'Interview went well');

-- INTERVIEWS
INSERT INTO interviews (candidate_id, job_id, interview_date, interview_time, interview_type, mode, meet_link, interviewer_name, status, recruiter_id) VALUES
(1, 1, '2026-03-25', '10:00', 'Technical', 'Google Meet', 'https://meet.google.com/fx-java-001', 'Rajesh Mehta', 'Scheduled', 2),
(5, 4, '2026-03-25', '14:00', 'Client', 'Google Meet', 'https://meet.google.com/fx-sap-004', 'Vikram Singh', 'Scheduled', 3),
(20, 9, '2026-03-26', '11:00', 'Technical', 'Google Meet', 'https://meet.google.com/fx-react-009', 'Tech Panel', 'Scheduled', 4),
(6, 7, '2026-03-24', '15:00', 'HR', 'Google Meet', 'https://meet.google.com/fx-pm-007', 'Priya Nair', 'Completed', 2),
(10, 8, '2026-03-26', '10:30', 'Technical', 'Google Meet', 'https://meet.google.com/fx-qa-008', 'Tech Panel', 'Scheduled', 3),
(11, 10, '2026-03-27', '16:00', 'Client', 'In-Person', NULL, 'ML Lead', 'Pending Confirmation', 1);

-- PLACEMENTS (completed hires)
INSERT INTO placements (candidate_id, job_id, client_id, recruiter_id, joining_date, offered_ctc, fee_percent, fee_amount, invoice_status) VALUES
(3, 3, 4, 2, '2026-03-15', 28, 8.33, 233240, 'Sent'),
(7, 6, 6, 1, '2026-03-01', 42, 8.33, 349860, 'Paid');
