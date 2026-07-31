-- Migration: Add task issue tracking columns to tasks table

ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS has_issue BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS issue_details TEXT,
ADD COLUMN IF NOT EXISTS issue_reported_at TIMESTAMP WITH TIME ZONE;
