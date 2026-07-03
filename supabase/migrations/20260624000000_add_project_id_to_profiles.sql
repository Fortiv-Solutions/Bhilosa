-- Migration to add project_id to profiles table for Project Manager assignments
ALTER TABLE public.profiles ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
