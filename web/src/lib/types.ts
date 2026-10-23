// Shapes of the data the server sends (same as the phone app's types).

export type AppSettings = {
  salesman_installed_report: 'off' | 'own' | 'all';
  session_idle_minutes: '30' | '480' | '10080' | '43200';
};

export type Role = 'admin' | 'salesman' | 'technician';
export type Grade = 'senior' | 'junior';
export type JobStatus = 'pending' | 'assigned' | 'in_progress' | 'kiv' | 'completed' | 'cancelled';

export type User = {
  id: number;
  name: string;
  username: string;
  role: Role;
  grade: Grade | null;
  phone?: string | null;
  active?: number;
  must_change_password?: number;
};

export type JobType = {
  id: number;
  name: string;
  warranty_months: number;
  senior_rate: number;
  junior_rate: number;
  incentive_cap: number | null;
  active: number;
};

export type ExtraItem = {
  id: number;
  name: string;
  unit: string;
  senior_amount: number;
  junior_amount: number;
  active: number;
};

export type JobSummary = {
  id: number;
  job_no: string;
  customer_name: string;
  address: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: JobStatus;
  kiv_reason: string | null;
  kiv_follow_up_date: string | null;
  warranty_end: string | null;
  completed_at: string | null;
  contract_id: number | null;
  inv_do_no: string | null;
  submitted_at: string | null;
  product_model?: string | null;
  product_variant?: string | null;
  salesman_name?: string | null;
  job_type: string;
  technicians: string | null;
};

export type IncentiveLine = {
  technician_id: number;
  name: string;
  grade: Grade;
  base: number;
  extras: { id: number; name: string; unit: string; qty: number; note: string | null; amount: number }[];
  adjustments: { id: number; amount: number; reason: string }[];
  total: number;
  earns: boolean;
  under_warranty: boolean;
  capped: boolean;
  cap: number | null;
};

export type Photo = {
  id: number;
  caption: string | null;
  stage: 'before' | 'after' | null;
  created_at: string;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
};

export type JobDetail = JobSummary & {
  job_type_id: number;
  customer_phone: string | null;
  description: string | null;
  salesman_id: number | null;
  salesman_name: string | null;
  started_at: string | null;
  warranty_months: number | null;
  under_warranty: number;
  incentive_cap: number | null;
  product_model: string | null;
  product_variant: string | null;
  product_brand: string | null;
  site_contact: string | null;
  owner_name: string | null;
  outstation: number;
  night_work: number;
  customer_comment: string | null;
  technician_signature: string | null;
  work_done: string | null;
  remarks: string | null;
  customer_sign_name: string | null;
  customer_signature: string | null;
  salesman_signature: string | null;
  salesman_signed_at: string | null;
  technicians: { id: number; name: string; grade: Grade }[];
  extras: {
    id: number;
    qty: number;
    note: string | null;
    technician_id: number | null;
    technician_name: string | null;
    created_by: number;
    name: string;
    unit: string;
  }[];
  photos: Photo[];
  logs: { action: string; note: string | null; created_at: string; user_name: string | null }[];
  incentive?: IncentiveLine[];
};

export type Contract = {
  id: number;
  customer_name: string;
  customer_phone: string | null;
  address: string | null;
  job_type_id: number;
  job_type?: string;
  interval_months: number;
  start_date: string;
  end_date: string | null;
  next_service_date: string;
  notes: string | null;
  active: number;
};

export type Reminders = {
  today: JobSummary[];
  tomorrow: JobSummary[];
  overdue: JobSummary[];
  kiv: JobSummary[];
  unassigned?: JobSummary[];
  upcoming_contracts?: (Pick<Contract, 'id' | 'customer_name' | 'address' | 'next_service_date' | 'interval_months'> & { job_type: string })[];
  warranty_expiring?: JobSummary[];
  awaiting_signature?: JobSummary[];
  awaiting_done?: JobSummary[];
};

export type InstalledReport = {
  from: string;
  to: string;
  total: number;
  by_model: {
    model: string | null;
    variant: string | null;
    count: number;
    jobs: {
      job_id: number;
      job_no: string;
      customer_name: string;
      address: string | null;
      completed_at: string;
      inv_do_no: string | null;
      job_type: string;
      technicians: string | null;
    }[];
  }[];
};

export type IncentiveReport = {
  from: string;
  to: string;
  grand_total: number;
  technicians: {
    technician_id: number;
    name: string;
    grade: Grade;
    job_count: number;
    base_total: number;
    extras_total: number;
    adjustments_total: number;
    total: number;
    jobs: {
      job_id: number;
      job_no: string;
      customer_name: string;
      job_type: string;
      completed_at: string;
      base: number;
      extras: IncentiveLine['extras'];
      adjustments: IncentiveLine['adjustments'];
      total: number;
    }[];
  }[];
};
